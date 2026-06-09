import { test, expect } from 'playwright/test';

const BUYER_EMAIL = 'yeonseong.dev@gmail.com';
const BUYER_PASSWORD = 'password123';

test('debug login and home navigation', async ({ page }) => {
  page.on('console', msg => console.log('[PAGE]', msg.type(), msg.text()));
  page.on('response', resp => {
    if (resp.url().includes('localhost:3001')) {
      console.log('[RESP]', resp.status(), resp.url().substring(0, 100));
    }
  });
  
  await page.goto('/login');
  await page.fill('input[name="email"]', BUYER_EMAIL);
  await page.fill('input[name="password"]', BUYER_PASSWORD);
  await page.getByRole('button', { name: '로그인' }).click();
  
  // Wait a bit to see what happens
  await page.waitForTimeout(3000);
  console.log('URL after login:', page.url());
  
  // Try direct navigation
  const response = await page.goto('/home', { waitUntil: 'networkidle' });
  console.log('Direct goto /home status:', response?.status());
  console.log('URL after goto:', page.url());
  
  await expect(page).toHaveURL(/\/home$/);
});
