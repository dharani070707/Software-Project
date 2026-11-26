import { Page } from '@playwright/test';

export const USERS = {
  admin:   { email: 'admin@hospital.com',   password: 'password', home: /\/admin\/dashboard/ },
  doctor:  { email: 'sarah@hospital.com',   password: 'password', home: /\/doctor\/dashboard/ },
  patient: { email: 'patient@hospital.com', password: 'password', home: /\/patient\/dashboard/ },
};

export async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.fill('input[name="username"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
}

// Unique email per run so tests never collide in the shared database
export function uniqueEmail(prefix = 'user') {
  return `${prefix}.${Date.now()}.${Math.floor(Math.random() * 1000)}@test.com`;
}
