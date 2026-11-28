import { test, expect } from '@playwright/test';
import { USERS, login } from '../../helper/auth';
import { appointmentsOf, bookViaUi, isoDate, newLoggedInPatient } from '../../helper/app';

// Part A (Dharani): network-failure tests. Playwright's page.route() sits between the browser
// and the network, so we can make a request fail, return an error, or be slow,
// and context.setOffline() simulates losing the connection completely.
// The question each test asks: does the user get told, and is data safe?

const ERROR_TEXT = /could not|unable|failed|error|try again/i;

// TC-NET-01: the calendar's data request fails at the network level
test('TC-NET-01: calendar shows an error when loading appointments fails', async ({ page }) => {
  await login(page, USERS.patient.email, USERS.patient.password);
  await page.route('**/appointment/events*', (route) => route.abort('connectionfailed'));
  await page.goto('/appointment/calendar');

  await expect(page.getByText(ERROR_TEXT)).toBeVisible();
});

// TC-NET-02: the calendar's data request reaches the server, which answers 500
test('TC-NET-02: calendar shows an error when the server returns 500', async ({ page }) => {
  await login(page, USERS.patient.email, USERS.patient.password);
  await page.route('**/appointment/events*', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' }));
  await page.goto('/appointment/calendar');

  await expect(page.getByText(ERROR_TEXT)).toBeVisible();
});

// TC-NET-03: the third-party calendar library (CDN) cannot be downloaded
test('TC-NET-03: calendar page tells the user when the calendar library fails to load', async ({ page }) => {
  const jsErrors: string[] = [];
  page.on('pageerror', (e) => jsErrors.push(e.message));
  await login(page, USERS.patient.email, USERS.patient.password);
  await page.route('**/cdn.jsdelivr.net/**', (route) => route.abort());
  await page.goto('/appointment/calendar');

  await expect(page.getByText(ERROR_TEXT)).toBeVisible();
  expect(jsErrors, 'page should not crash with an uncaught script error').toEqual([]);
});

// TC-NET-04: the connection drops while submitting a booking.
// Nothing may be half-saved, and the user can retry once back online.
test('TC-NET-04: booking submitted while offline saves nothing; retry works', async ({ page, context }) => {
  const p = await newLoggedInPatient(page, 'offline');
  await page.goto('/appointment/book');
  await page.selectOption('select[name="doctorId"]', { index: 1 });
  await page.fill('input[name="date"]', isoDate(6));
  await page.fill('input[name="time"]', '13:00');

  await context.setOffline(true);
  await page.click('button[type="submit"]').catch(() => {});   // navigation fails offline
  expect(await appointmentsOf(p.email)).toHaveLength(0);

  await context.setOffline(false);
  await bookViaUi(page, isoDate(6), '13:00');
  expect(await appointmentsOf(p.email)).toHaveLength(1);     // exactly one, no duplicate
});

// TC-NET-05: a very slow API must not block the page from rendering
test('TC-NET-05: calendar page renders while the data request is slow', async ({ page }) => {
  await login(page, USERS.patient.email, USERS.patient.password);
  await page.route('**/appointment/events*', async (route) => {
    await new Promise((r) => setTimeout(r, 5000));
    await route.continue();
  });
  await page.goto('/appointment/calendar', { waitUntil: 'domcontentloaded' });

  await expect(page.getByText('My Appointments')).toBeVisible({ timeout: 2000 });
});

// TC-NET-06: the styling CDN is down - the login still works (graceful degradation)
test('TC-NET-06: login still works when the CSS framework CDN is unreachable', async ({ page }) => {
  await page.route('**/cdn.tailwindcss.com/**', (route) => route.abort());
  await login(page, USERS.patient.email, USERS.patient.password);

  await expect(page).toHaveURL(USERS.patient.home);
});
