import { test, expect, Page } from '@playwright/test';
import { USERS } from '../../helper/auth';
import { appointmentsOf, csrfToken, disableBrowserValidation, isoDate, newLoggedInPatient, sql, userId } from '../../helper/app';

// Part B (Abhishek): BYPASS TESTING of the appointment booking form.
//
// Bypass testing (Offutt et al.): the browser enforces rules like `required`,
// `min` and fixed <select> options, but an attacker can skip the browser.
// We bypass each client-side rule and check the SERVER still rejects the
// input, using the database as the source of truth.
//
//   value level      - send a value the HTML would block (past date, bad time)
//   parameter level  - change a value the user cannot normally pick (doctorId)
//   control-flow     - skip the form and POST straight to the server

// Control-flow bypass: POST the booking form directly
async function postBooking(page: Page, form: Record<string, string>) {
  return page.request.post('/appointment/book', {
    form: { ...form, _csrf: await csrfToken(page, '/appointment/book') },
  });
}

// TC-BYP-01 (value): date in the past. HTML has min="2025-01-01".
test('TC-BYP-01: booking with a past date is rejected by the server', async ({ page }) => {
  const p = await newLoggedInPatient(page, 'past');
  await page.goto('/appointment/book');
  await disableBrowserValidation(page);
  await page.selectOption('select[name="doctorId"]', { index: 1 });
  await page.fill('input[name="date"]', '2020-01-01');
  await page.fill('input[name="time"]', '10:00');
  await page.click('button[type="submit"]');

  expect(await appointmentsOf(p.email)).toHaveLength(0);
});

// TC-BYP-02 (parameter): the dropdown only lists doctors; rewrite an option's
// value to the ADMIN's user id and submit through the real form.
test('TC-BYP-02: booking with a non-doctor (admin) as doctor is rejected', async ({ page }) => {
  const p = await newLoggedInPatient(page, 'notdoc');
  const adminId = await userId(USERS.admin.email);
  await page.goto('/appointment/book');
  await page.evaluate((id) => {
    const opt = document.querySelectorAll('select[name="doctorId"] option')[1] as HTMLOptionElement;
    opt.value = String(id);
  }, adminId);
  await page.selectOption('select[name="doctorId"]', { index: 1 });
  await page.fill('input[name="date"]', isoDate(5));
  await page.fill('input[name="time"]', '10:00');
  await page.click('button[type="submit"]');

  const rows = await appointmentsOf(p.email);
  expect(rows.filter((r) => r.doctor_email === USERS.admin.email)).toHaveLength(0);
});

// TC-BYP-03 (parameter): a doctorId that does not exist -> graceful error, not a crash
test('TC-BYP-03: booking with a non-existent doctor id fails gracefully', async ({ page }) => {
  const p = await newLoggedInPatient(page, 'nodoc');
  const res = await postBooking(page, { doctorId: '999999', date: isoDate(5), time: '10:00' });

  expect(res.status(), 'should be a handled error, not HTTP 500').toBeLessThan(500);
  expect(await appointmentsOf(p.email)).toHaveLength(0);
});

// TC-BYP-04 (value): impossible time value
test('TC-BYP-04: booking with an invalid time fails gracefully', async ({ page }) => {
  const p = await newLoggedInPatient(page, 'badtime');
  const res = await postBooking(page, {
    doctorId: String(await userId(USERS.doctor.email)), date: isoDate(5), time: '25:99',
  });

  expect(res.status(), 'should be a handled error, not HTTP 500').toBeLessThan(500);
  expect(await appointmentsOf(p.email)).toHaveLength(0);
});

// TC-BYP-05 (control-flow): a required field missing entirely
test('TC-BYP-05: booking with the time field missing is rejected', async ({ page }) => {
  const p = await newLoggedInPatient(page, 'notime');
  const res = await postBooking(page, { doctorId: String(await userId(USERS.doctor.email)), date: isoDate(5) });

  expect(res.status()).toBe(400);
  expect(await appointmentsOf(p.email)).toHaveLength(0);
});

// TC-BYP-06 (business rule): the same doctor cannot be double-booked
test('TC-BYP-06: the same doctor slot cannot be booked twice', async ({ browser }) => {
  // A random far-future slot, so earlier runs cannot already occupy it
  const date = isoDate(100 + Math.floor(Math.random() * 500));
  const slot = { doctorId: '', date, time: '08:30' };

  for (const who of ['dblA', 'dblB']) {
    const page = await (await browser.newContext()).newPage();
    await newLoggedInPatient(page, who);
    slot.doctorId = String(await userId(USERS.doctor.email));
    await postBooking(page, slot);
  }

  const rows = await sql(
    `SELECT 1 FROM appointments a JOIN users d ON d.id = a.doctor_id
      WHERE d.email = $1 AND a.start_time = $2::timestamp`,
    [USERS.doctor.email, `${date} 08:30`],
  );
  expect(rows).toHaveLength(1);
});
