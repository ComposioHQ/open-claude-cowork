import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';

async function prepareHomeState(page) {
  await page.waitForLoadState('domcontentloaded');

  const authView = page.locator('#authView');
  const authSkipBtn = page.locator('#authSkipBtn');
  const homeView = page.locator('#homeView');
  const homeInput = page.locator('#homeInput');
  const leftSidebar = page.locator('#leftSidebar');

  // Keep tests deterministic when auth view appears.
  if (await authView.isVisible()) {
    for (let attempt = 0; attempt < 40; attempt++) {
      if (!(await authView.isVisible())) {
        break;
      }
      if (await authSkipBtn.isVisible()) {
        await authSkipBtn.click();
        await page.waitForTimeout(250);
      } else {
        await page.waitForTimeout(250);
      }
    }
  }

  if (await authView.isVisible()) {
    await page.evaluate(() => {
      const auth = document.getElementById('authView');
      if (auth) auth.classList.add('hidden');
      const home = document.getElementById('homeView');
      const chat = document.getElementById('chatView');
      const settings = document.getElementById('settingsView');
      const reports = document.getElementById('reportsView');
      const jobs = document.getElementById('jobsView');
      const vault = document.getElementById('vaultView');
      const sidebar = document.getElementById('leftSidebar');

      if (home) home.classList.remove('hidden');
      if (chat) chat.classList.add('hidden');
      if (settings) settings.classList.add('hidden');
      if (reports) reports.classList.add('hidden');
      if (jobs) jobs.classList.add('hidden');
      if (vault) vault.classList.add('hidden');
      if (sidebar) sidebar.classList.remove('hidden', 'collapsed');
      if (sidebar) {
        sidebar.style.width = '';
        sidebar.style.minWidth = '';
      }
      if (typeof window.showView === 'function') {
        window.showView('home');
      }
    });
  }

  await expect(homeView).toBeVisible();
  await expect(homeInput).toBeVisible();
  await expect(leftSidebar).toBeVisible();
}

async function collapseMobileSidebarIfNeeded(page) {
  const isMobile = (page.viewportSize()?.width || 0) <= 768;
  if (!isMobile) {
    return;
  }

  const leftSidebar = page.locator('#leftSidebar');
  const leftSidebarClass = (await leftSidebar.getAttribute('class')) || '';
  if (leftSidebarClass.includes('collapsed')) {
    return;
  }

  const collapseBtn = page.locator('#leftSidebarToggle');
  if (await collapseBtn.isVisible()) {
    await collapseBtn.click();
    await page.waitForTimeout(250);
  }
}

test.describe('Critical User Journeys', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 });
    await prepareHomeState(page);
  });

  test('should complete core chat-to-settings-to-home journey', async ({ page }) => {
    const homeInput = page.locator('#homeInput');
    const sendButton = page.locator('#homeSendBtn');
    const settingsBtn = page.locator('#settingsSidebarBtn');
    const settingsBackBtn = page.locator('#settingsBackBtn');

    await homeInput.fill('Critical journey smoke check');
    await expect(sendButton).toBeEnabled();

    await page.locator('.new-chat-sidebar-btn').click();
    await expect(page.locator('#homeView')).toBeVisible();
    await expect(page.locator('#homeInput')).toBeVisible();

    await settingsBtn.click();
    await expect(page.locator('#settingsView')).toBeVisible();
    await expect(page.locator('.settings-title')).toContainText('Settings');

    await collapseMobileSidebarIfNeeded(page);

    await settingsBackBtn.click();
    await expect(page.locator('#homeView')).toBeVisible();
    await expect(homeInput).toBeVisible();
  });

  test('should navigate across app sections and return to home', async ({ page }) => {
    await page.locator('#reportsSidebarBtn').click();
    await expect(page.locator('#reportsView')).toBeVisible();
    await expect(page.locator('.reports-title')).toContainText('Reports');

    await page.locator('#jobsSidebarBtn').click();
    await expect(page.locator('#jobsView')).toBeVisible();
    await expect(page.locator('.jobs-title')).toContainText('Workflows');

    await page.locator('#vaultSidebarBtn').click();
    await expect(page.locator('#vaultView')).toBeVisible();
    await expect(page.locator('.vault-title')).toContainText('Vault');

    await page.locator('.new-chat-sidebar-btn').click();
    await expect(page.locator('#homeView')).toBeVisible();
  });

  test('should complete provider, model, and thinking controls flow', async ({ page }) => {
    const providerSelector = page.locator('#homeProviderDropdown .provider-selector');
    const modelSelector = page.locator('#homeModelDropdown .model-selector');
    const thinkingBtn = page.locator('#homeThinkingBtn');

    await collapseMobileSidebarIfNeeded(page);

    await providerSelector.click();
    await expect(page.locator('#homeProviderDropdown .dropdown-menu')).toBeVisible();
    await page.locator('#homeProviderDropdown .dropdown-item[data-value="claude"]').click();
    await expect(providerSelector).toContainText('Claude');

    await modelSelector.click();
    await expect(page.locator('#homeModelDropdown .dropdown-menu')).toBeVisible();
    await page.locator('#homeModelDropdown .dropdown-item[data-value="claude-haiku-4-5-20250514"]').click();
    await expect(modelSelector).toContainText(/haiku/i);

    await expect(thinkingBtn).toBeVisible();
    await thinkingBtn.click();
    const thinkingActive = await thinkingBtn.evaluate((el) => el.classList.contains('active'));
    expect(thinkingActive).toBeTruthy();
  });
});
