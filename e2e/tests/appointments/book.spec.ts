import { test, expect } from '@playwright/test';
import { USERS, login } from '../../helper/auth';
import { appointmentsOf, bookViaUi, isoDate, logout, newLoggedInPatient } from '../../helper/app';

// Positive tests for the "add a record" requirement: a patient books an
// appointment and every role that should see it, does.
// Each test registers its own fresh patient, so the patient's name (and the
// appointment title "Checkup - <name>") is unique and tests never interfere.

// TC-APPT-01: booking through the form writes the right row to the database
test('TC-APPT-01: valid booking is saved in the database', async ({ page }) => {
  const p = await newLoggedInPatient(page, 'appt1');
  const date = isoDate(7);

  await bookViaUi(page, date, '10:30');

  await expect(page).toHaveURL(/\/appointment\/calendar/);
  const rows = await appointmentsOf(p.email);
  expect(rows).toHaveLength(1);
  expect(rows[0].status).toBe('SCHEDULED');
  expect(rows[0].doctor_email).toBe(USERS.doctor.email);
  expect(rows[0].title).toBe(`Checkup - ${p.name}`);
  // Server sets a 30-minute slot
  expect(rows[0].end_time.getTime() - rows[0].start_time.getTime()).toBe(30 * 60 * 1000);
});

// TC-APPT-02: the patient sees the new appointment on their calendar
test('TC-APPT-02: booked appointment appears on the patient calendar', async ({ page }) => {
  const p = await newLoggedInPatient(page, 'appt2');
  await bookViaUi(page, isoDate(0), '23:30');   // today, so it is in the current month view

  await expect(page.locator('.fc-event', { hasText: p.name })).toBeVisible();
});

// TC-APPT-03: the user gets confirmation that the booking worked
test('TC-APPT-03: success message is shown after booking', async ({ page }) => {
  await newLoggedInPatient(page, 'appt3');
  await bookViaUi(page, isoDate(7), '11:00');

  await expect(page.getByText('Appointment booked successfully!')).toBeVisible();
});

// TC-APPT-04: the dashboard "Upcoming" counter goes up
test('TC-APPT-04: patient dashboard upcoming count increases', async ({ page }) => {
  await newLoggedInPatient(page, 'appt4');
  await bookViaUi(page, isoDate(7), '12:00');

  await page.goto('/patient/dashboard');
  const upcoming = page.locator('h3:has-text("Upcoming") + p');
  await expect(upcoming).toHaveText('1');
});

// TC-APPT-05: the doctor sees today's appointment in "Today's Patients"
test("TC-APPT-05: doctor sees today's appointment on dashboard", async ({ page }) => {
  const p = await newLoggedInPatient(page, 'appt5');
  await bookViaUi(page, isoDate(0), '23:45');
  await logout(page);

  await login(page, USERS.doctor.email, USERS.doctor.password);
  await expect(page).toHaveURL(USERS.doctor.home);
  await expect(page.getByText(p.name, { exact: true })).toBeVisible();
});

// TC-APPT-06: the admin sees it in the all-appointments table
test('TC-APPT-06: admin sees the appointment in the appointments list', async ({ page }) => {
  const p = await newLoggedInPatient(page, 'appt6');
  await bookViaUi(page, isoDate(3), '09:15');
  await logout(page);

  await login(page, USERS.admin.email, USERS.admin.password);
  await page.goto('/admin/appointments');
  const row = page.locator('tr', { hasText: p.name });
  await expect(row).toBeVisible();
  await expect(row).toContainText('Dr. Sarah Doctor');
  await expect(row).toContainText('SCHEDULED');
});

// TC-APPT-07: privacy — one patient's events feed never contains another's
test("TC-APPT-07: patient cannot see another patient's appointments", async ({ browser }) => {
  // Two separate browser contexts = two separate logged-in users
  const pageA = await (await browser.newContext()).newPage();
  const a = await newLoggedInPatient(pageA, 'privA');
  await bookViaUi(pageA, isoDate(5), '14:00');

  const pageB = await (await browser.newContext()).newPage();
  await newLoggedInPatient(pageB, 'privB');
  const events = await (await pageB.request.get('/appointment/events')).json();

  expect(events.map((e: any) => e.patientName)).not.toContain(a.name);
});
