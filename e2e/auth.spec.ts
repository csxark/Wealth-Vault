import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Authentication E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display login form', async ({ page }) => {
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });

  test('should show validation errors for empty form', async ({ page }) => {
    await page.getByRole('button', { name: /sign in/i }).click();
    
    // Wait for validation messages
    await expect(page.locator('text=/email.*required/i')).toBeVisible();
    await expect(page.locator('text=/password.*required/i')).toBeVisible();
  });

  test('should show error for invalid email format', async ({ page }) => {
    await page.locator('input[type="email"]').fill('invalid-email');
    await page.locator('input[type="password"]').fill('password123');
    await page.getByRole('button', { name: /sign in/i }).click();
    
    await expect(page.locator('text=/valid email/i')).toBeVisible();
  });

  test('should switch to register mode', async ({ page }) => {
    await page.getByText(/don't have an account/i).click();
    
    await expect(page.getByRole('button', { name: /sign up/i })).toBeVisible();
    await expect(page.locator('input[name="name"]')).toBeVisible();
  });

  test('should show password strength in register mode', async ({ page }) => {
    await page.getByText(/don't have an account/i).click();
    
    await page.locator('input[type="password"]').first().fill('weak');
    await expect(page.locator('[data-testid="password-strength-meter"]')).toBeVisible();
  });

  test('should successfully register new user', async ({ page }) => {
    await page.getByText(/don't have an account/i).click();
    
    const timestamp = Date.now();
    await page.locator('input[name="name"]').fill('Test User');
    await page.locator('input[type="email"]').fill(`test${timestamp}@example.com`);
    await page.locator('input[type="password"]').first().fill('StrongP@ss123');
    
    await page.getByRole('button', { name: /sign up/i }).click();
    
    // Should redirect to dashboard or profile setup
    await expect(page).toHaveURL(/\/(dashboard|profile-setup)/);
  });

  test('should have no accessibility violations on login page', async ({ page }) => {
    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
    
    expect(accessibilityScanResults.violations).toEqual([]);
  });
});
