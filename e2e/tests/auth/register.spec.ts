import { test, expect, Page } from '@playwright/test';
import { login, uniqueEmail } from '../../helper/auth';

async function fillRegister(
  page: Page,
  o: { email: string; password: string; name?: string; phone?: string }
) {
  await page.goto('/register');
  await page.fill('input[name="name"]', o.name ?? 'Test Patient');
  await page.fill('input[name="email"]', o.email);
  await page.fill('input[name="password"]', o.password);
  await page.fill('input[name="phone"]', o.phone ?? '9999999999');
}

// Turns off HTML required/minlength/type=email checks so the server is tested directly
async function disableBrowserValidation(page: Page) {
  await page.evaluate(() => {
    (document.querySelector('form') as HTMLFormElement).noValidate = true;
  });
}

// TC-AUTH-05: registration writes a usable account to the DB
test('TC-AUTH-05: new patient can register and then log in', async ({ page }) => {
  const email = uniqueEmail('reg');
  await fillRegister(page, { email, password: 'secret123' });
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/login/);

  await login(page, email, 'secret123');
  await expect(page).toHaveURL(/\/patient\/dashboard/);
});

test('TC-AUTH-05b: success message is shown after registration', async ({ page }) => {
  await fillRegister(page, { email: uniqueEmail('msg'), password: 'secret123' });
  await page.click('button[type="submit"]');
  await expect(page.getByText(/registration successful/i)).toBeVisible();
});

// TC-AUTH-06: duplicate email
test('TC-AUTH-06: duplicate email is rejected with a visible error', async ({ page }) => {
  const email = uniqueEmail('dup');
  await fillRegister(page, { email, password: 'secret123' });
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/login/);

  await fillRegister(page, { email, password: 'secret123' });
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/register/);
  await expect(page.getByText('Email already registered!', { exact: true })).toBeVisible();
});

// TC-AUTH-07: password length boundary, 6 is the minimum per the form
for (const len of [6, 7]) {
  test(`TC-AUTH-07 (UI, ${len} chars): accepted`, async ({ page }) => {
    await fillRegister(page, { email: uniqueEmail('len'), password: 'a'.repeat(len) });
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/login/);
  });
}

test('TC-AUTH-07 (UI, 5 chars): blocked by the browser', async ({ page }) => {
  await fillRegister(page, { email: uniqueEmail('len'), password: 'a'.repeat(5) });
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/register/);
});

// Bypass-based: same inputs with browser validation off, so the SERVER must reject them
for (const pw of ['12345', '']) {
  test(`TC-AUTH-07 (server, password "${pw}"): rejected`, async ({ page }) => {
    await page.goto('/register');
    await disableBrowserValidation(page);
    await page.fill('input[name="name"]', 'Bypass Tester');
    await page.fill('input[name="email"]', uniqueEmail('bypass'));
    await page.fill('input[name="password"]', pw);
    await page.click('button[type="submit"]');
    await expect(page).not.toHaveURL(/\/login/);   // /login means the account was created
  });
}
