import { test, expect } from '@playwright/test';
import { USERS, login } from '../../helper/auth';
import { bookViaUi, isoDate, logout, newLoggedInPatient } from '../../helper/app';

// Part A (Dharani): anonymous access and data exposure.
// Can someone with NO session reach protected pages, and does a logged-in
// user receive more data than they should?

// TC-UNAUTH-01: no session -> every protected page sends you to login
for (const path of ['/admin/dashboard', '/admin/users', '/doctor/dashboard', '/patient/dashboard',
                    '/appointment/book', '/appointment/calendar']) {
  test(`TC-UNAUTH-01 (${path}): anonymous user is redirected to login`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/);
  });
}

// TC-UNAUTH-13: the doctor's "My Schedule" calendar loads /appointment/doctor/events.
// It must be valid JSON (or the calendar cannot draw it) and must never
// contain other users' credentials, such as password hashes.
test("TC-UNAUTH-13: doctor's schedule feed is valid JSON with no password hashes", async ({ page }) => {
  // Arrange: make sure Dr Sarah has at least one appointment
  await newLoggedInPatient(page, 'feed');
  await bookViaUi(page, isoDate(9), '15:00');
  await logout(page);

  await login(page, USERS.doctor.email, USERS.doctor.password);
  const body = await (await page.request.get('/appointment/doctor/events')).text();

  expect(body, 'response must not contain password fields').not.toContain('"password"');
  expect(() => JSON.parse(body), 'response must be valid JSON').not.toThrow();
});
