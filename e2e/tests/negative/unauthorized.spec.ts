import { test, expect } from '@playwright/test';
import { USERS, login } from '../../helper/auth';
import { appointmentsOf, csrfToken, isoDate, newLoggedInPatient, registerPatient, sql, userId } from '../../helper/app';

// Unauthorized-access tests built with SESSION-DATA-BASED testing:
// we capture, replay, tamper with, or remove the session (the JSESSIONID
// cookie and CSRF token) and check the server enforces access rules itself.

// TC-UNAUTH-01: no session -> every protected page sends you to login
for (const path of ['/admin/dashboard', '/admin/users', '/doctor/dashboard', '/patient/dashboard',
                    '/appointment/book', '/appointment/calendar']) {
  test(`TC-UNAUTH-01 (${path}): anonymous user is redirected to login`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/);
  });
}

// TC-UNAUTH-02: the JSON API also refuses anonymous callers
test('TC-UNAUTH-02: anonymous call to /appointment/events returns no data', async ({ request }) => {
  const res = await request.get('/appointment/events', { maxRedirects: 0 });
  expect(res.status()).toBe(302);
  expect(res.headers()['location']).toContain('/login');
});

// TC-UNAUTH-03..05: logged in, but with the wrong role -> 403 Forbidden
const wrongRole: [string, keyof typeof USERS, string][] = [
  ['TC-UNAUTH-03', 'patient', '/admin/users'],
  ['TC-UNAUTH-04', 'patient', '/doctor/dashboard'],
  ['TC-UNAUTH-05', 'doctor',  '/admin/dashboard'],
];
for (const [id, role, path] of wrongRole) {
  test(`${id}: ${role} opening ${path} is forbidden`, async ({ page }) => {
    await login(page, USERS[role].email, USERS[role].password);
    const res = await page.goto(path);
    expect(res?.status()).toBe(403);
  });
}

// TC-UNAUTH-06: a patient replays an admin-only POST with their own valid
// session + CSRF token. The server must refuse and the victim must survive.
test('TC-UNAUTH-06: patient cannot call the admin delete-user action', async ({ page }) => {
  const victim = await registerPatient(page, 'victim');
  await newLoggedInPatient(page, 'attacker');

  const res = await page.request.post(`/admin/users/${await userId(victim.email)}/delete`, {
    form: { _csrf: await csrfToken(page, '/patient/dashboard') },
  });

  expect(res.status()).toBe(403);
  expect(await sql('SELECT 1 FROM users WHERE email = $1', [victim.email])).toHaveLength(1);
});

// TC-UNAUTH-07: privilege escalation - a patient tries to make themself ADMIN
test('TC-UNAUTH-07: patient cannot change their own role to ADMIN', async ({ page }) => {
  const me = await newLoggedInPatient(page, 'escalate');

  const res = await page.request.post(`/admin/users/${await userId(me.email)}/role`, {
    form: { role: 'ADMIN', _csrf: await csrfToken(page, '/patient/dashboard') },
  });

  expect(res.status()).toBe(403);
  expect((await sql('SELECT role FROM users WHERE email = $1', [me.email]))[0].role).toBe('PATIENT');
});

// TC-UNAUTH-08: a session cookie copied before logout is useless afterwards
test('TC-UNAUTH-08: saved session cookie is invalid after logout', async ({ page, browser }) => {
  await login(page, USERS.patient.email, USERS.patient.password);
  const stolen = await page.context().storageState();     // attacker copies the cookies
  await page.getByRole('button', { name: 'Logout' }).click();
  await expect(page).toHaveURL(/\/login/);

  const attacker = await browser.newContext({ storageState: stolen });
  const attackerPage = await attacker.newPage();
  await attackerPage.goto('/patient/dashboard');
  await expect(attackerPage).toHaveURL(/\/login/);
  await attacker.close();
});

// TC-UNAUTH-09: a forged / tampered session id gives no access
test('TC-UNAUTH-09: tampered JSESSIONID cookie is rejected', async ({ page, context }) => {
  await login(page, USERS.patient.email, USERS.patient.password);
  const cookies = await context.cookies();
  const session = cookies.find((c) => c.name === 'JSESSIONID')!;
  await context.clearCookies();
  await context.addCookies([{ ...session, value: session.value.slice(0, -4) + 'AAAA' }]);

  await page.goto('/patient/dashboard');
  await expect(page).toHaveURL(/\/login/);
});

// TC-UNAUTH-10: session fixation - the session id must change at login
test('TC-UNAUTH-10: session id changes after login (no session fixation)', async ({ page, context }) => {
  await page.goto('/login');
  const before = (await context.cookies()).find((c) => c.name === 'JSESSIONID')?.value;
  await login(page, USERS.patient.email, USERS.patient.password);
  const after = (await context.cookies()).find((c) => c.name === 'JSESSIONID')?.value;

  expect(after).toBeTruthy();
  expect(after).not.toBe(before);
});

// TC-UNAUTH-11: a valid session but no CSRF token -> request refused, nothing saved
test('TC-UNAUTH-11: booking POST without CSRF token is rejected', async ({ page }) => {
  const p = await newLoggedInPatient(page, 'nocsrf');
  const doctorId = await userId(USERS.doctor.email);

  const res = await page.request.post('/appointment/book', {
    form: { doctorId: String(doctorId), date: isoDate(5), time: '10:00' },   // no _csrf
  });

  expect(res.status()).toBe(403);
  expect(await appointmentsOf(p.email)).toHaveLength(0);
});

// TC-UNAUTH-12: only patients may book (doctor gets a clear message)
test('TC-UNAUTH-12: doctor cannot book an appointment', async ({ page }) => {
  await login(page, USERS.doctor.email, USERS.doctor.password);
  await page.goto('/appointment/book');
  await page.selectOption('select[name="doctorId"]', { index: 1 });
  await page.fill('input[name="date"]', isoDate(5));
  await page.fill('input[name="time"]', '10:00');
  await page.click('button[type="submit"]');

  await expect(page.getByText('Only registered patients can book appointments.')).toBeVisible();
});
