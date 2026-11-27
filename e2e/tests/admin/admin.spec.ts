import { test, expect } from '@playwright/test';
import { USERS, login } from '../../helper/auth';
import { appointmentsOf, bookViaUi, isoDate, logout, newLoggedInPatient, registerPatient, sql } from '../../helper/app';

// Admin "edit / delete existing records" features, checked against the DB.

async function loginAdmin(page: import('@playwright/test').Page) {
  await login(page, USERS.admin.email, USERS.admin.password);
  await expect(page).toHaveURL(USERS.admin.home);
}

// TC-ADM-01: dashboard totals match the real row counts
test('TC-ADM-01: admin dashboard counters match the database', async ({ page }) => {
  await loginAdmin(page);
  const [c] = await sql(`SELECT
      (SELECT count(*) FROM users)                   AS users,
      (SELECT count(*) FROM patients)                AS patients,
      (SELECT count(*) FROM users WHERE role='DOCTOR') AS doctors,
      (SELECT count(*) FROM appointments)            AS appointments`);

  // Each card is <p>Label</p><p>number</p>; find the label exactly, take the next <p>
  const card = (label: string) =>
    page.locator('p', { hasText: new RegExp(`^${label}$`) }).locator('xpath=following-sibling::p[1]');
  await expect(card('Total Users')).toHaveText(String(c.users));
  await expect(card('Patients')).toHaveText(String(c.patients));
  await expect(card('Doctors')).toHaveText(String(c.doctors));
  await expect(card('Appointments')).toHaveText(String(c.appointments));
});

// TC-ADM-02: deleting a user with no appointments removes them everywhere
test('TC-ADM-02: admin deletes a patient who has no appointments', async ({ page }) => {
  const p = await registerPatient(page, 'del');
  await loginAdmin(page);
  await page.goto('/admin/users');

  page.once('dialog', (d) => d.accept());
  await page.locator('tr', { hasText: p.email }).getByRole('button', { name: /delete/i }).click();

  await expect(page.getByText('User deleted successfully!')).toBeVisible();
  await expect(page.locator('tr', { hasText: p.email })).toHaveCount(0);
  expect(await sql('SELECT 1 FROM users WHERE email = $1', [p.email])).toHaveLength(0);
  expect(await sql('SELECT 1 FROM patients WHERE email = $1', [p.email])).toHaveLength(0);
});

// TC-ADM-03: deleting a patient who HAS an appointment must not crash.
// Either outcome is acceptable (delete with their appointments, or refuse
// with a message); a server error page is not.
test('TC-ADM-03: admin deletes a patient who has an appointment', async ({ page }) => {
  const p = await newLoggedInPatient(page, 'delappt');
  await bookViaUi(page, isoDate(4), '10:00');
  await logout(page);

  await loginAdmin(page);
  await page.goto('/admin/users');
  page.once('dialog', (d) => d.accept());
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/delete') && r.request().method() === 'POST'),
    page.locator('tr', { hasText: p.email }).getByRole('button', { name: /delete/i }).click(),
  ]);

  expect(res.status(), 'server should not answer with an error').toBeLessThan(500);
  await expect(page).toHaveURL(/\/admin\/users/);
});

// TC-ADM-04: admin marks an appointment as completed
test('TC-ADM-04: admin marks an appointment as completed', async ({ page }) => {
  const p = await newLoggedInPatient(page, 'complete');
  await bookViaUi(page, isoDate(2), '16:00');
  await logout(page);

  await loginAdmin(page);
  await page.goto('/admin/appointments');
  await page.locator('tr', { hasText: p.name }).getByRole('button', { name: /complete/i }).click();

  const [appt] = await appointmentsOf(p.email);
  expect(appt.status).toBe('COMPLETED');
});

// TC-ADM-05: the role dropdown shows each user's current role
test("TC-ADM-05: role dropdown shows the user's current role", async ({ page }) => {
  await loginAdmin(page);
  await page.goto('/admin/users');

  for (const u of Object.values(USERS)) {
    const [{ role }] = await sql('SELECT role FROM users WHERE email = $1', [u.email]);
    await expect(page.locator('tr', { hasText: u.email }).locator('select[name="role"]')).toHaveValue(role);
  }
});
