import { test, expect } from '@playwright/test';
import { USERS, login, uniqueEmail } from '../../helper/auth';

// TC-AUTH-01: valid login for each role
for (const [role, u] of Object.entries(USERS)) {
  test(`TC-AUTH-01 (${role}): valid login lands on correct dashboard`, async ({ page }) => {
    await login(page, u.email, u.password);
    await expect(page).toHaveURL(u.home);
  });
}

// TC-AUTH-02: wrong password
// Expected: stays on login with an error, no session created
test('TC-AUTH-02: wrong password shows error', async ({ page }) => {
  await login(page, USERS.admin.email, 'wrong-password');
  await expect(page).toHaveURL(/\/login\?error/);
  await expect(page.locator('.bg-red-50')).toBeVisible();   // verify this selector in the browser
});

// TODO TC-AUTH-03: unknown email (what should the URL and message be?)
// TODO TC-AUTH-04: logout, then page.goBack() and try a protected URL
//
// TC-AUTH-03: unknown email must not reveal that the account doesn't exist
test('TC-AUTH-03: unknown email gives same error as wrong password', async ({ page }) => {
  await login(page, uniqueEmail('ghost'), 'whatever');
  await expect(page).toHaveURL(/\/login\?error/);
  const unknownMsg = await page.locator('.bg-red-50').innerText();

  await login(page, USERS.admin.email, 'wrong-password');
  const wrongPwMsg = await page.locator('.bg-red-50').innerText();

  expect(unknownMsg).toBe(wrongPwMsg);   // no user enumeration
});

// TC-AUTH-04: after logout, protected pages need a fresh login
test('TC-AUTH-04: logout then back button cannot reach protected page', async ({ page }) => {
  await login(page, USERS.patient.email, USERS.patient.password);
  await expect(page).toHaveURL(USERS.patient.home);
  await page.getByRole('button', { name: 'Logout' }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goBack();
  await page.goto('/patient/dashboard');
  await expect(page).toHaveURL(/\/login/);
  await expect(page.locator('input[name="username"]')).toBeVisible();
});
