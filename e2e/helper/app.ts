import { Page, expect } from '@playwright/test';
import { Client } from 'pg';
import { login, uniqueEmail } from './auth';

// ---------------------------------------------------------------------------
// Database access
// The tests read PostgreSQL directly to prove that a UI action really changed
// (or did NOT change) a row. Connection settings come from the standard
// PG* environment variables (PGHOST, PGPORT, PGUSER, PGPASSWORD), so each
// teammate can point it at their own local database without editing code.
// ---------------------------------------------------------------------------
export async function sql<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  const client = new Client({ database: process.env.PGDATABASE ?? 'hospitaldb' });
  await client.connect();
  try {
    return (await client.query(text, params)).rows as T[];
  } finally {
    await client.end();
  }
}

export async function appointmentsOf(patientEmail: string) {
  return sql(
    `SELECT a.id, a.title, a.start_time, a.end_time, a.status, d.email AS doctor_email
       FROM appointments a
       JOIN patients p ON p.id = a.patient_id
       JOIN users d    ON d.id = a.doctor_id
      WHERE p.email = $1
      ORDER BY a.id`,
    [patientEmail],
  );
}

export async function userId(email: string): Promise<number> {
  const rows = await sql<{ id: string }>('SELECT id FROM users WHERE email = $1', [email]);
  return Number(rows[0]?.id);
}

// ---------------------------------------------------------------------------
// Dates: always computed at run time, so tests never go stale.
// ---------------------------------------------------------------------------
export function isoDate(daysFromToday: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  // Build YYYY-MM-DD from local time (toISOString() would shift to UTC).
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ---------------------------------------------------------------------------
// CSRF: Spring Security puts a hidden _csrf input in every Thymeleaf form.
// Direct POSTs (bypass tests) must send it, otherwise Spring rejects them
// with 403 before our input ever reaches the controller.
// ---------------------------------------------------------------------------
export async function csrfToken(page: Page, path: string): Promise<string> {
  const html = await (await page.request.get(path)).text();
  const match = html.match(/name="_csrf" value="([^"]+)"/);
  if (!match) throw new Error(`no _csrf token found on ${path}`);
  return match[1];
}

// ---------------------------------------------------------------------------
// Test data setup ("arrange" step).
// Registration is done with a direct HTTP request because it is setup, not
// the behaviour under test; registration itself is tested in auth/.
// ---------------------------------------------------------------------------
export type TestPatient = { name: string; email: string; password: string };

export async function registerPatient(page: Page, prefix = 'pt'): Promise<TestPatient> {
  const p = {
    name: `Test ${prefix} ${Date.now() % 1_000_000}`,
    email: uniqueEmail(prefix),
    password: 'secret123',
  };
  const res = await page.request.post('/register', {
    form: { ...p, phone: '9999999999', _csrf: await csrfToken(page, '/register') },
  });
  expect(res.ok()).toBeTruthy();
  return p;
}

export async function newLoggedInPatient(page: Page, prefix = 'pt'): Promise<TestPatient> {
  const p = await registerPatient(page, prefix);
  await login(page, p.email, p.password);
  await expect(page).toHaveURL(/\/patient\/dashboard/);
  return p;
}

// Ends the session the same way the Logout button does (POST /logout + CSRF).
// Used where logout is only a step between roles; the button itself is
// tested in TC-AUTH-04. Some pages (e.g. /admin/users) have no Logout button.
export async function logout(page: Page) {
  const token = await csrfToken(page, '/dashboard');
  await page.request.post('/logout', { form: { _csrf: token } });
}

// Books through the real form, exactly as a user would.
export async function bookViaUi(page: Page, date: string, time: string, doctor: RegExp = /Sarah/) {
  await page.goto('/appointment/book');
  await page.selectOption('select[name="doctorId"]', { label: await doctorLabel(page, doctor) });
  await page.fill('input[name="date"]', date);
  await page.fill('input[name="time"]', time);
  await page.click('button[type="submit"]');
}

// selectOption needs the exact label text, so look it up from the dropdown.
async function doctorLabel(page: Page, doctor: RegExp): Promise<string> {
  const labels = await page.locator('select[name="doctorId"] option').allInnerTexts();
  const label = labels.find((l) => doctor.test(l));
  if (!label) throw new Error(`no doctor matching ${doctor} in dropdown: ${labels.join(', ')}`);
  return label.trim();
}
