/**
 * Visual tour: open every main view and key sub-views, assert key elements, take screenshots.
 * Run with: npx playwright test tests/visual-tour.spec.js
 * Headed:   npx playwright test tests/visual-tour.spec.js --headed
 */
import { test, expect } from '@playwright/test';
import { prepareAppState } from './helpers/e2e-app-state.js';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';

async function collapseMobileSidebarIfNeeded(page) {
  const w = page.viewportSize()?.width ?? 0;
  if (w > 768) return;
  const leftSidebar = page.locator('#leftSidebar');
  const cls = (await leftSidebar.getAttribute('class')) || '';
  if (cls.includes('collapsed')) return;
  const collapseBtn = page.locator('#leftSidebarToggle');
  if (await collapseBtn.isVisible()) {
    await collapseBtn.click();
    await page.waitForTimeout(250);
  }
}

test.describe('Visual tour', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 });
    await prepareAppState(page, { skipAuth: true, forceHome: true });
    await expect(page.locator('#homeView')).toBeVisible();
    await expect(page.locator('#homeInput')).toBeVisible();
    await expect(page.locator('#leftSidebar')).toBeVisible();
  });

  test('opens every main view and captures screenshot per view', async ({ page }, testInfo) => {
    const artifactsDir = testInfo.outputDir;
    const screenshot = async (viewName) => {
      await page.screenshot({
        path: `${artifactsDir}/visual-tour-${viewName}.png`,
        fullPage: false
      });
    };

    // Home (already open)
    await expect(page.locator('#homeView')).toBeVisible();
    await expect(page.locator('.greeting-text')).toContainText(/Open Claude Cowork/i);
    await expect(page.locator('#homeInput')).toBeVisible();
    await collapseMobileSidebarIfNeeded(page);
    await screenshot('home');

    // Use showView() to switch views (avoids depending on sidebar visibility)
    const showView = async (viewName) => {
      await page.evaluate((name) => {
        if (typeof window.showView === 'function') window.showView(name);
      }, viewName);
      await page.waitForTimeout(400);
    };

    // Settings
    await showView('settings');
    await expect(page.locator('#settingsView')).toBeVisible();
    await expect(page.locator('.settings-title')).toContainText('Settings');
    await screenshot('settings');
    await page.locator('#settingsBackBtn').click();
    await expect(page.locator('#homeView')).toBeVisible();
    await page.waitForTimeout(300);

    // Database (only if Supabase configured – nav may be visible)
    const navDbBtn = page.locator('#navDbBtn');
    if (await navDbBtn.isVisible()) {
      await showView('database');
      await expect(page.locator('#dbView')).toBeVisible();
      await expect(page.locator('.db-title')).toContainText('Database Explorer');
      await expect(page.locator('#dbConnectionSummary')).toBeVisible();
      await screenshot('database');
      await page.locator('#dbBackBtn').click();
      await expect(page.locator('#homeView')).toBeVisible();
      await page.waitForTimeout(300);
    }

    // Reports
    await showView('reports');
    await expect(page.locator('#reportsView')).toBeVisible();
    await expect(page.locator('.reports-title')).toContainText('Reports');
    await screenshot('reports');
    await page.waitForTimeout(200);

    // Jobs
    await showView('jobs');
    await expect(page.locator('#jobsView')).toBeVisible();
    await expect(page.locator('.jobs-title')).toContainText('Workflows');
    await screenshot('jobs');
    await page.waitForTimeout(200);

    // Vault
    await showView('vault');
    await expect(page.locator('#vaultView')).toBeVisible();
    await expect(page.locator('.vault-title')).toContainText('Vault');
    await screenshot('vault');

    // Back to home and trigger Chat view (type + send)
    await showView('home');
    await page.locator('#homeInput').fill('Visual tour test');
    await page.locator('#homeSendBtn').click();
    await page.waitForTimeout(2000);
    if (await page.locator('#chatView').isVisible()) {
      await expect(page.locator('#chatView')).toBeVisible();
      await screenshot('chat');
    }
  });
});
