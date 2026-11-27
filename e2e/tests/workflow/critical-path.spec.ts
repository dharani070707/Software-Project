import { test, expect } from '@playwright/test';
import { USERS, login, uniqueEmail } from '../../helper/auth';
import { appointmentsOf, bookViaUi, isoDate, logout, sql } from '../../helper/app';

// The critical end-to-end workflows of the application. Each test drives one
// record through several roles, and checks the database at every step.

// TC-FLOW-01: patient life cycle
//   register (UI) -> login -> book -> doctor sees it -> admin sees it
//   -> admin deletes it -> it is gone from the DB and from the admin list
test('TC-FLOW-01: register, book, doctor + admin see it, admin deletes it', async ({ page }) => {
  const name = `Flow Patient ${Date.now() % 1_000_000}`;
  const email = uniqueEmail('flow');

  // 1. Register through the real form
  await page.goto('/register');
  await page.fill('input[name="name"]', name);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', 'secret123');
  await page.fill('input[name="phone"]', '9876543210');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/login/);
  expect(await sql('SELECT 1 FROM users WHERE email = $1 AND role = $2', [email, 'PATIENT'])).toHaveLength(1);
  expect(await sql('SELECT 1 FROM patients WHERE email = $1', [email])).toHaveLength(1);

  // 2. Log in and book for today (so it shows under the doctor's "Today's Patients")
  await login(page, email, 'secret123');
  await expect(page).toHaveURL(/\/patient\/dashboard/);
  await bookViaUi(page, isoDate(0), '23:15');
  const [appt] = await appointmentsOf(email);
  expect(appt.status).toBe('SCHEDULED');
  await logout(page);

  // 3. Doctor sees the patient
  await login(page, USERS.doctor.email, USERS.doctor.password);
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  await logout(page);

  // 4. Admin sees the appointment and deletes it (the delete button asks to confirm)
  await login(page, USERS.admin.email, USERS.admin.password);
  await page.goto('/admin/appointments');
  const row = page.locator('tr', { hasText: name });
  await expect(row).toBeVisible();
  page.once('dialog', (d) => d.accept());
  await row.locator('button[title="Delete Appointment"]').click();

  // 5. Gone from the UI and the DB
  await expect(page.getByText('Appointment deleted successfully!')).toBeVisible();
  await expect(page.locator('tr', { hasText: name })).toHaveCount(0);
  expect(await appointmentsOf(email)).toHaveLength(0);
});

// TC-FLOW-02: admin promotes a user to doctor
//   admin changes role -> DB updated -> user now lands on doctor dashboard
//   -> new doctor appears in the patients' booking dropdown
test('TC-FLOW-02: admin promotes a registered user to doctor', async ({ page }) => {
  const name = `New Doctor ${Date.now() % 1_000_000}`;
  const email = uniqueEmail('promo');
  await page.goto('/register');
  await page.fill('input[name="name"]', name);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', 'secret123');
  await page.click('button[type="submit"]');

  // Admin changes the role; the dropdown submits its form on change
  await login(page, USERS.admin.email, USERS.admin.password);
  await page.goto('/admin/users');
  await page.locator('tr', { hasText: email }).locator('select[name="role"]').selectOption('DOCTOR');
  await expect(page.getByText('Role changed to DOCTOR successfully!')).toBeVisible();
  expect((await sql('SELECT role FROM users WHERE email = $1', [email]))[0].role).toBe('DOCTOR');
  await logout(page);

  // The promoted user now gets the doctor dashboard
  await login(page, email, 'secret123');
  await expect(page).toHaveURL(USERS.doctor.home);
  await logout(page);

  // ...and patients can choose them when booking
  await login(page, USERS.patient.email, USERS.patient.password);
  await page.goto('/appointment/book');
  await expect(page.locator('select[name="doctorId"] option', { hasText: name })).toHaveCount(1);
});
