import { test, expect, Page } from '@playwright/test';
import { login, uniqueEmail } from '../../helper/auth';
import { disableBrowserValidation, sql } from '../../helper/app';

// Part A (Dharani): BYPASS TESTING of the registration form (value level).
// The form has `required` on name and email, `type="email"`, and
// `minlength="6"` on the password (that one is TC-AUTH-07 in auth/).
// We switch those checks off and see whether the SERVER still rejects the
// input. The verdict comes from the database: rejected = no row in `users`.

async function registerBypassingBrowser(page: Page, fields: { name: string; email: string; password: string }) {
  await page.goto('/register');
  await disableBrowserValidation(page);
  await page.fill('input[name="name"]', fields.name);
  await page.fill('input[name="email"]', fields.email);
  await page.fill('input[name="password"]', fields.password);
  await page.click('button[type="submit"]');
}

// TC-BYP-07: empty name (HTML has `required`)
test('TC-BYP-07: registration with an empty name is rejected', async ({ page }) => {
  const email = uniqueEmail('noname');
  await registerBypassingBrowser(page, { name: '', email, password: 'secret123' });

  expect(await sql('SELECT 1 FROM users WHERE email = $1', [email])).toHaveLength(0);
});

// TC-BYP-08: not an email address (HTML has type="email")
test('TC-BYP-08: registration with an invalid email is rejected', async ({ page }) => {
  const email = `not-an-email-${Date.now()}`;
  await registerBypassingBrowser(page, { name: 'Bad Email', email, password: 'secret123' });

  expect(await sql('SELECT 1 FROM users WHERE email = $1', [email])).toHaveLength(0);
});

// TC-BYP-09: a name longer than the database column (255).
// Note: we check what the USER sees, not the HTTP status. When this crashes,
// Spring forwards to /error, which needs login, so the browser is quietly
// redirected to /login - it looks like success even though nothing was saved.
test('TC-BYP-09: registration with a 300-character name shows a validation error', async ({ page }) => {
  const email = uniqueEmail('long');
  await registerBypassingBrowser(page, { name: 'x'.repeat(300), email, password: 'secret123' });

  await expect(page, 'user must stay on the form with an error').toHaveURL(/\/register/);
  expect(await sql('SELECT 1 FROM users WHERE email = $1', [email])).toHaveLength(0);
});

// TC-BYP-10: HTML/script in the name must be shown as text, never run
test('TC-BYP-10: script in the name is displayed as text, not executed', async ({ page }) => {
  const name = `<img src=x onerror="window.__xss=1">Eve`;
  const email = uniqueEmail('xss');
  await registerBypassingBrowser(page, { name, email, password: 'secret123' });
  await login(page, email, 'secret123');

  await expect(page.getByText(name, { exact: true })).toBeVisible();          // shown literally
  expect(await page.evaluate(() => (window as any).__xss)).toBeUndefined();   // never executed
});
