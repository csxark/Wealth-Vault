import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Dashboard E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto('/');
    await page.locator('input[type="email"]').fill('test@example.com');
    await page.locator('input[type="password"]').fill('password123');
    await page.getByRole('button', { name: /sign in/i }).click();
    
    // Wait for dashboard to load
    await page.waitForURL('**/dashboard');
  });

  test('should display dashboard with financial data', async ({ page }) => {
    await expect(page.getByText('Financial Dashboard')).toBeVisible();
    await expect(page.getByText('Total Spent')).toBeVisible();
    await expect(page.getByText('Safe Spending')).toBeVisible();
    await expect(page.getByText('Budget Remaining')).toBeVisible();
  });

  test('should switch between tabs', async ({ page }) => {
    // Click Transactions tab
    await page.getByRole('button', { name: /transactions/i }).click();
    await expect(page.getByText('Recent Transactions')).toBeVisible();
    
    // Click Analytics tab
    await page.getByRole('button', { name: /analytics/i }).click();
    await expect(page.getByText('Monthly Spending Trend')).toBeVisible();
    
    // Click Categories tab
    await page.getByRole('button', { name: /categories/i }).click();
    await expect(page.getByText('Spending by Category')).toBeVisible();
  });

  test('should open add expense modal', async ({ page }) => {
    await page.getByRole('button', { name: /add expense/i }).click();
    
    await expect(page.getByText(/new expense/i)).toBeVisible();
  });

  test('should add new expense', async ({ page }) => {
    await page.getByRole('button', { name: /add expense/i }).click();
    
    // Fill expense form
    await page.locator('input[name="amount"]').fill('100');
    await page.locator('select[name="category"]').selectOption('safe');
    await page.locator('input[name="description"]').fill('Test Expense');
    await page.locator('select[name="paymentMethod"]').selectOption('credit-card');
    
    await page.getByRole('button', { name: /save|add/i }).click();
    
    // Should show success toast
    await expect(page.getByText(/expense.*added/i)).toBeVisible();
  });

  test('should change time range filter', async ({ page }) => {
    const timeRangeSelect = page.locator('select').first();
    
    await timeRangeSelect.selectOption('week');
    await expect(timeRangeSelect).toHaveValue('week');
    
    await timeRangeSelect.selectOption('year');
    await expect(timeRangeSelect).toHaveValue('year');
  });

  test('should display empty state when no expenses', async ({ page, context }) => {
    // Create new user with no expenses
    await page.goto('/');
    const timestamp = Date.now();
    await page.locator('input[type="email"]').fill(`empty${timestamp}@example.com`);
    await page.locator('input[type="password"]').fill('StrongP@ss123');
    
    // Assume empty state
    await expect(page.getByText(/no expenses yet/i)).toBeVisible();
  });

  test('should use currency converter', async ({ page }) => {
    const converter = page.locator('[data-testid="currency-converter"]');
    
    if (await converter.isVisible()) {
      await converter.locator('select').first().selectOption('INR');
      await converter.locator('select').last().selectOption('USD');
      await converter.getByRole('button', { name: /convert|go/i }).click();
      
      // Should show conversion result
      await expect(converter.getByText(/INR.*USD/)).toBeVisible();
    }
  });

  test('should have no accessibility violations on dashboard', async ({ page }) => {
    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
    
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('should be responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    
    await expect(page.getByText('Financial Dashboard')).toBeVisible();
    await expect(page.getByText('Total Spent')).toBeVisible();
  });
});
