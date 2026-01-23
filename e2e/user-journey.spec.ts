import { test, expect } from '@playwright/test';

test.describe('Complete User Journey E2E', () => {
  test('should complete full user journey from signup to adding expenses', async ({ page }) => {
    const timestamp = Date.now();
    const testEmail = `journey${timestamp}@example.com`;
    
    // Step 1: Navigate to app
    await page.goto('/');
    await expect(page).toHaveTitle(/wealth.*vault/i);
    
    // Step 2: Register new user
    await page.getByText(/don't have an account/i).click();
    await page.locator('input[name="name"]').fill('Journey Test User');
    await page.locator('input[type="email"]').fill(testEmail);
    await page.locator('input[type="password"]').first().fill('StrongP@ss123');
    await page.getByRole('button', { name: /sign up/i }).click();
    
    // Step 3: Complete profile setup (if required)
    const profileSetupHeading = page.getByText(/profile setup|get started/i);
    if (await profileSetupHeading.isVisible({ timeout: 2000 })) {
      await page.locator('input[name="monthlyBudget"]').fill('50000');
      await page.getByRole('button', { name: /continue|next/i }).click();
    }
    
    // Step 4: Navigate to dashboard
    await page.waitForURL('**/dashboard');
    await expect(page.getByText('Financial Dashboard')).toBeVisible();
    
    // Step 5: Add first expense
    await page.getByRole('button', { name: /add expense/i }).click();
    await page.locator('input[name="amount"]').fill('500');
    await page.locator('select[name="category"]').selectOption('safe');
    await page.locator('input[name="description"]').fill('Groceries');
    await page.locator('select[name="paymentMethod"]').selectOption('credit-card');
    await page.getByRole('button', { name: /save|add/i }).click();
    
    // Step 6: Verify expense appears
    await expect(page.getByText('Groceries')).toBeVisible();
    await expect(page.getByText('₹ 500')).toBeVisible();
    
    // Step 7: View analytics
    await page.getByRole('button', { name: /analytics/i }).click();
    await expect(page.getByText('Monthly Spending Trend')).toBeVisible();
    
    // Step 8: Check AI Coach (if available)
    const coachLink = page.getByRole('link', { name: /coach/i });
    if (await coachLink.isVisible()) {
      await coachLink.click();
      await expect(page.getByText(/ai.*coach|financial.*advice/i)).toBeVisible();
    }
    
    // Step 9: Logout
    const profileMenu = page.locator('[data-testid="profile-menu"]');
    if (await profileMenu.isVisible()) {
      await profileMenu.click();
      await page.getByRole('button', { name: /logout|sign out/i }).click();
      await expect(page).toHaveURL('/');
    }
  });
});
