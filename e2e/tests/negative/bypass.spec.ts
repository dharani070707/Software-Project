import { test, expect, Page } from '@playwright/test';
import { USERS, login, uniqueEmail } from '../../helper/auth';
import { appointmentsOf, csrfToken, isoDate, newLoggedInPatient, sql, userId } from '../../helper/app';

// BYPASS TESTING (Offutt et al.): the browser enforces rules like `required`,
// `min`, `type="email"` and fixed <select> options, but an attacker can skip
// the browser entirely. We bypass each client-side rule and check the SERVER
// still rejects the input, using the database as the source of truth.
//
// Three bypass levels are used:
//   value level      - send a value the HTML would block (past date, bad time)
//   parameter level  - change a value the user cannot normally pick (doctorId)
//   control-flow     - skip the form and POST straight to the server

// Turn off all HTML5 validation on the page's form
async function disableBrowserValidation(page: Page) {
  await page.evaluate(() => {
    document.querySelectorAll('form').forEach((f) => (f.noValidate = true));
    document.querySelectorAll('input').forEach((i) => i.removeAttribute('min'));
  });
}

// Control-flow bypass: POST the booking form directly
async function postBooking(page: Page, form: Record<string, string>) {
  return page.request.post('/appointment/book', {
    form: { ...form, _csrf: await csrfToken(page, '/appointment/book') },
  });
}

// ---------------------------------------------------------------- booking ---

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

// ----------------------------------------------------------- registration ---
// (password length bypass is TC-AUTH-07 in auth/register.spec.ts)

async function registerBypassingBrowser(page: Page, fields: { name: string; email: string; password: string }) {
  await page.goto('/register');
  await disableBrowserValidation(page);
  await page.fill('input[name="name"]', fields.name);
  await page.fill('input[name="email"]', fields.email);
  await page.fill('input[name="password"]', fields.password);
  await page.click('button[type="submit"]');
}

// TC-BYP-07 (value): empty name (HTML has `required`)
test('TC-BYP-07: registration with an empty name is rejected', async ({ page }) => {
  const email = uniqueEmail('noname');
  await registerBypassingBrowser(page, { name: '', email, password: 'secret123' });

  expect(await sql('SELECT 1 FROM users WHERE email = $1', [email])).toHaveLength(0);
});

// TC-BYP-08 (value): not an email address (HTML has type="email")
test('TC-BYP-08: registration with an invalid email is rejected', async ({ page }) => {
  const email = `not-an-email-${Date.now()}`;
  await registerBypassingBrowser(page, { name: 'Bad Email', email, password: 'secret123' });

  expect(await sql('SELECT 1 FROM users WHERE email = $1', [email])).toHaveLength(0);
});

// TC-BYP-09 (value): a name longer than the database column (255).
// Note: we check what the USER sees, not the HTTP status. When this crashes,
// Spring forwards to /error, which needs login, so the browser is quietly
// redirected to /login - it looks like success even though nothing was saved.
test('TC-BYP-09: registration with a 300-character name shows a validation error', async ({ page }) => {
  const email = uniqueEmail('long');
  await registerBypassingBrowser(page, { name: 'x'.repeat(300), email, password: 'secret123' });

  await expect(page, 'user must stay on the form with an error').toHaveURL(/\/register/);
  expect(await sql('SELECT 1 FROM users WHERE email = $1', [email])).toHaveLength(0);
});

// TC-BYP-10 (value): HTML/script in the name must be shown as text, never run
test('TC-BYP-10: script in the name is displayed as text, not executed', async ({ page }) => {
  const name = `<img src=x onerror="window.__xss=1">Eve`;
  const email = uniqueEmail('xss');
  await registerBypassingBrowser(page, { name, email, password: 'secret123' });
  await login(page, email, 'secret123');

  await expect(page.getByText(name, { exact: true })).toBeVisible();          // shown literally
  expect(await page.evaluate(() => (window as any).__xss)).toBeUndefined();   // never executed
});
