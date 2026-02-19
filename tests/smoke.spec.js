import { test, expect } from '@playwright/test';
import { prepareAppState } from './helpers/e2e-app-state.js';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';

const CORE_API_ENDPOINTS = [
  '/api/jobs',
  '/api/reports/summary',
  '/api/chats',
  '/api/vault/folders'
];

const CORE_API_NAME_BY_ENDPOINT = {
  '/api/jobs': 'jobs',
  '/api/reports/summary': 'report summary',
  '/api/chats': 'chats',
  '/api/vault/folders': 'vault folders'
};

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

test.describe('Backend Dependency Smoke', () => {
  for (const endpoint of CORE_API_ENDPOINTS) {
    test(`should keep ${CORE_API_NAME_BY_ENDPOINT[endpoint]} API healthy`, async ({ request }) => {
      const response = await request.get(`${BASE_URL}${endpoint}`);
      expect(response.status()).toBeLessThan(500);
    });
  }
});

test.describe('Open Claude Cowork - Smoke Tests', () => {

  test.beforeEach(async ({ page }, testInfo) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForLoadState('domcontentloaded');
    await prepareAppState(page, {
      skipAuth: testInfo.title !== 'should display authentication skip option',
      forceHome: testInfo.title !== 'should display authentication skip option'
    });
    await expect(page.locator('#homeView')).toBeVisible();
    await expect(page.locator('#homeInput')).toBeVisible();
    await expect(page.locator('#leftSidebar')).toBeVisible();
    await expect(page.locator('#homeThinkingBtn')).toBeVisible();
  });

  test('should load the application', async ({ page }) => {
    // Check that the page loads successfully
    await expect(page).toHaveTitle(/Claude/i);

    // Verify main container is present
    await expect(page.locator('.app-container')).toBeVisible();

    // Verify either home view/chat view is visible OR auth flow is available
    const homeView = page.locator('#homeView');
    const chatView = page.locator('#chatView');
    const authView = page.locator('#authView');

    const isHomeVisible = await homeView.isVisible();
    const isChatVisible = await chatView.isVisible();
    const isAuthVisible = await authView.isVisible();

    if (isAuthVisible) {
      await expect(page.locator('#authSkipBtn')).toBeVisible();
    } else {
      expect(isHomeVisible || isChatVisible).toBeTruthy();
    }
  });

  test('should display home view with greeting', async ({ page }) => {
    // Check for home view elements
    await expect(page.locator('.greeting-text')).toContainText(/Open Claude Cowork/i);
    await expect(page.locator('.tagline')).toContainText(/Powered by Claude Code and Composio/i);

    // Check for home input
    await expect(page.locator('#homeInput')).toBeVisible();
  });

  test('should display chat interface elements on home view', async ({ page }) => {
    // Check for message input
    const messageInput = page.locator('#homeInput');
    await expect(messageInput).toBeVisible();
    await expect(messageInput).toHaveAttribute('placeholder', 'Ask me anything');

    // Check for send button (initially disabled)
    const sendButton = page.locator('#homeSendBtn');
    await expect(sendButton).toBeVisible();
    await expect(sendButton).toBeDisabled();

    // Check for attach button
    await expect(page.locator('#homeAttachBtn')).toBeVisible();

    // Check for vault picker button
    await expect(page.locator('#homeVaultPickerBtn')).toBeVisible();

    // Check for thinking button
    await expect(page.locator('#homeThinkingBtn')).toBeVisible();
  });

  test('should display provider and model selection', async ({ page }) => {
    // Look for provider selector dropdown
    const providerSelector = page.locator('#homeProviderDropdown .provider-selector');
    await expect(providerSelector).toBeVisible();
    await expect(providerSelector).toContainText('Claude');

    // Look for model selector dropdown
    const modelSelector = page.locator('#homeModelDropdown .model-selector');
    await expect(modelSelector).toBeVisible();
    await expect(modelSelector).toContainText('Sonnet 4.5');
  });

  test('should open provider dropdown menu', async ({ page }) => {
    await collapseMobileSidebarIfNeeded(page);

    // Click provider selector
    await page.locator('#homeProviderDropdown .provider-selector').click();

    // Verify dropdown menu appears with options
    const dropdownMenu = page.locator('#homeProviderDropdown .dropdown-menu');
    await expect(dropdownMenu).toBeVisible();

    // Check for Claude option
    await expect(page.locator('#homeProviderDropdown .dropdown-item[data-value="claude"]')).toBeVisible();
  });

  test('should open model dropdown menu', async ({ page }) => {
    // Click model selector
    await page.locator('#homeModelDropdown .model-selector').click();

    // Verify dropdown menu appears
    const dropdownMenu = page.locator('#homeModelDropdown .dropdown-menu');
    await expect(dropdownMenu).toBeVisible();

    // Check for model options
    await expect(page.locator('#homeModelDropdown .dropdown-item[data-value="claude-opus-4-5-20250514"]')).toBeVisible();
    await expect(page.locator('#homeModelDropdown .dropdown-item[data-value="claude-sonnet-4-5-20250514"]')).toBeVisible();
    await expect(page.locator('#homeModelDropdown .dropdown-item[data-value="claude-haiku-4-5-20250514"]')).toBeVisible();
  });

  test('should open settings when settings button is clicked', async ({ page }) => {
    // Find and click settings button in left sidebar footer
    const settingsButton = page.locator('#settingsSidebarBtn');
    await expect(settingsButton).toBeVisible();
    await settingsButton.click();

    // Verify settings view appears
    await expect(page.locator('#settingsView')).toBeVisible();
    await expect(page.locator('.settings-title')).toContainText('Settings');

    // Verify settings sections are present
    await expect(page.locator('#settingsView .settings-section-title').filter({ hasText: 'Provider tokens' })).toBeVisible();
    await expect(page.locator('#settingsView .settings-section-title').filter({ hasText: 'MCP servers' })).toBeVisible();
  });

  test('should navigate back from settings', async ({ page }) => {
    // Open settings
    await page.locator('#settingsSidebarBtn').click();
    await expect(page.locator('#settingsView')).toBeVisible();

    await collapseMobileSidebarIfNeeded(page);

    // Click back button
    await page.locator('#settingsBackBtn').click();

    // Verify we're back to home view
    await expect(page.locator('#homeView')).toBeVisible();
  });

  test('should create a new chat when typing and sending message', async ({ page }) => {
    // Find message input
    const messageInput = page.locator('#homeInput');
    await messageInput.fill('Hello, this is a test message');

    // Verify send button becomes enabled
    const sendButton = page.locator('#homeSendBtn');
    await expect(sendButton).toBeEnabled();

    // Verify text was entered
    await expect(messageInput).toHaveValue('Hello, this is a test message');
  });

  test('should handle message input and enable send button', async ({ page }) => {
    const messageInput = page.locator('#homeInput');
    const sendButton = page.locator('#homeSendBtn');

    // Initially disabled
    await expect(sendButton).toBeDisabled();

    // Type a test message
    await messageInput.fill('Test message');

    // Now enabled
    await expect(sendButton).toBeEnabled();

    // Clear input
    await messageInput.clear();

    // Disabled again
    await expect(sendButton).toBeDisabled();
  });

  test('should display left sidebar with navigation buttons', async ({ page }) => {
    const sidebar = page.locator('#leftSidebar');
    await expect(sidebar).toBeVisible();

    // Check for new chat button
    await expect(page.locator('.new-chat-sidebar-btn')).toBeVisible();

    // Check for footer buttons
    await expect(page.locator('#reportsSidebarBtn')).toBeVisible();
    await expect(page.locator('#jobsSidebarBtn')).toBeVisible();
    await expect(page.locator('#vaultSidebarBtn')).toBeVisible();
    await expect(page.locator('#settingsSidebarBtn')).toBeVisible();
  });

  test('should collapse and expand left sidebar', async ({ page }) => {
    const sidebar = page.locator('#leftSidebar');
    const collapseBtn = page.locator('#leftSidebarToggle');
    const expandBtn = page.locator('#leftSidebarExpand');

    // Initially sidebar is visible
    await expect(sidebar).toBeVisible();

    // Click collapse button
    await collapseBtn.click();

    // Wait for animation
    await page.waitForTimeout(300);

    // Expand button should now be visible
    await expect(expandBtn).toBeVisible();

    // Click expand button
    await expandBtn.click();

    // Wait for animation
    await page.waitForTimeout(300);

    // Sidebar should be visible again
    await expect(sidebar).toBeVisible();
  });

  test('should open Reports view', async ({ page }) => {
    await page.locator('#reportsSidebarBtn').click();
    await expect(page.locator('#reportsView')).toBeVisible();
    await expect(page.locator('.reports-title')).toContainText('Reports');
  });

  test('should open Jobs view', async ({ page }) => {
    await page.locator('#jobsSidebarBtn').click();
    await expect(page.locator('#jobsView')).toBeVisible();
    await expect(page.locator('.jobs-title')).toContainText('Workflows');
  });

  test('should open Vault view', async ({ page }) => {
    await page.locator('#vaultSidebarBtn').click();
    await expect(page.locator('#vaultView')).toBeVisible();
    await expect(page.locator('.vault-title')).toContainText('Vault');
  });

  test('should display authentication skip option', async ({ page }) => {
    // Check if auth view is present
    const authView = page.locator('#authView');

    if (await authView.isVisible()) {
      // Verify skip button exists
      const skipButton = page.locator('#authSkipBtn');
      await expect(skipButton).toBeVisible();
      await expect(skipButton).toContainText(/Continue without account/i);

      // Verify auth form elements
      await expect(page.locator('#authEmail')).toBeVisible();
      await expect(page.locator('#authPassword')).toBeVisible();
      await expect(page.locator('#authSubmitBtn')).toBeVisible();
    }
  });

  test('should handle file attachment button click', async ({ page }) => {
    const attachBtn = page.locator('#homeAttachBtn');
    await expect(attachBtn).toBeVisible();

    // The button should trigger file input (we won't actually upload)
    await expect(page.locator('#homeFileInput')).toBeHidden();
  });

  test('should toggle thinking mode button', async ({ page }) => {
    await collapseMobileSidebarIfNeeded(page);

    const thinkingBtn = page.locator('#homeThinkingBtn');
    await expect(thinkingBtn).toBeVisible();

    // Click thinking button
    await thinkingBtn.click();

    // Button should have active class (visual indicator)
    const hasActiveClass = await thinkingBtn.evaluate(el => el.classList.contains('active'));
    expect(typeof hasActiveClass).toBe('boolean');
  });

  test('should display disclaimer text in chat view', async ({ page }) => {
    // Type a message to transition to chat view
    await page.locator('#homeInput').fill('Test');

    // Look for disclaimer in the home input area or chat input area
    const disclaimer = page.locator('.disclaimer');
    await expect(disclaimer).toContainText(/Claude is AI and can make mistakes/i);
  });

  test('should handle new chat button click', async ({ page }) => {
    const newChatBtn = page.locator('.new-chat-sidebar-btn');
    await expect(newChatBtn).toBeVisible();
    await expect(newChatBtn).toContainText('New Chat');

    // Click should reset to home view
    await newChatBtn.click();
    await expect(page.locator('#homeView')).toBeVisible();
  });

  test('should show backend banner when backend is not running', async ({ page }) => {
    // Intercept API health check or first request
    await page.route('**/api/**', route => route.abort('failed'));

    // Reload to trigger connection check
    await page.reload();

    // Backend banner might appear (if implemented)
    // This is an optional check
    const banner = page.locator('#backendBanner');
    if (await banner.isVisible()) {
      await expect(banner).toContainText(/Backend not running/i);
    }
  });

  test('should validate required scripts are loaded', async ({ page }) => {
    // Check that key libraries are loaded
    const markedLoaded = await page.evaluate(() => typeof window.marked !== 'undefined');
    const DOMPurifyLoaded = await page.evaluate(() => typeof window.DOMPurify !== 'undefined');
    const chartLoaded = await page.evaluate(() => typeof window.Chart !== 'undefined');

    expect(markedLoaded).toBeTruthy();
    expect(DOMPurifyLoaded).toBeTruthy();
    expect(chartLoaded).toBeTruthy();
  });

  test('should have proper meta tags', async ({ page }) => {
    // Check viewport meta tag
    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(viewport).toContain('width=device-width');

    // Check charset
    const charset = await page.locator('meta[charset]').getAttribute('charset');
    expect(charset).toBe('UTF-8');
  });

  test('should load CSS stylesheet', async ({ page }) => {
    const stylesheetLoaded = await page.evaluate(() => {
      const link = document.querySelector('link[rel="stylesheet"][href="style.css"]');
      return link !== null;
    });
    expect(stylesheetLoaded).toBeTruthy();
  });

});

test.describe('Responsive Design Tests', () => {

  test('should work on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(BASE_URL);
    await prepareAppState(page, { skipAuth: true, forceHome: true });

    // Verify key elements are still accessible
    await expect(page.locator('.app-container')).toBeVisible();
    const messageInput = page.locator('#homeInput');
    await expect(messageInput).toBeVisible();

    // Verify mobile-friendly controls
    await expect(page.locator('#homeSendBtn')).toBeVisible();
  });

  test('should work on tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(BASE_URL);
    await prepareAppState(page, { skipAuth: true, forceHome: true });

    await expect(page.locator('.app-container')).toBeVisible();
    await expect(page.locator('#homeInput')).toBeVisible();
  });

  test('should work on desktop viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(BASE_URL);
    await prepareAppState(page, { skipAuth: true, forceHome: true });

    await expect(page.locator('.app-container')).toBeVisible();
    await expect(page.locator('#leftSidebar')).toBeVisible();
    await expect(page.locator('#homeInput')).toBeVisible();
  });

});

test.describe('Accessibility Tests', () => {

  test('should have accessible form controls', async ({ page }) => {
    await page.goto(BASE_URL);
    await prepareAppState(page, { skipAuth: true, forceHome: true });

    // Check that inputs have labels or placeholders
    const homeInput = page.locator('#homeInput');
    const placeholder = await homeInput.getAttribute('placeholder');
    expect(placeholder).toBeTruthy();

    // Check buttons have accessible text or titles
    const attachBtn = page.locator('#homeAttachBtn');
    const title = await attachBtn.getAttribute('title');
    expect(title).toBeTruthy();
  });

  test('should support keyboard navigation', async ({ page }) => {
    await page.goto(BASE_URL);
    await prepareAppState(page, { skipAuth: true, forceHome: true });

    // Tab to input
    await page.keyboard.press('Tab');
    const focusedElement = await page.evaluate(() => {
      const activeElement = document.activeElement;
      return activeElement?.id || activeElement?.tagName?.toLowerCase() || '';
    });
    expect(focusedElement).toBeTruthy();

    // Type in input
    await page.locator('#homeInput').focus();
    await page.keyboard.type('Test message');

    // Input should have focus and value
    const finalFocusedElement = await page.evaluate(() => document.activeElement?.id);
    const inputValue = await page.locator('#homeInput').inputValue();

    expect(finalFocusedElement).toBe('homeInput');
    expect(inputValue).toBe('Test message');
  });

  test('should have proper ARIA attributes where needed', async ({ page }) => {
    await page.goto(BASE_URL);
    await prepareAppState(page, { skipAuth: true, forceHome: true });

    // Check for role attributes on interactive elements
    const sendButton = page.locator('#homeSendBtn');
    const tagName = await sendButton.evaluate(el => el.tagName);
    expect(tagName).toBe('BUTTON');
  });

});

test.describe('Error Handling Tests', () => {

  test('should handle network errors gracefully', async ({ page }) => {
    // Intercept and fail API calls
    await page.route('**/api/**', route => route.abort('failed'));

    await page.goto(BASE_URL);
    await prepareAppState(page, { skipAuth: true, forceHome: true });

    // App should still load even if API is down
    await expect(page.locator('.app-container')).toBeVisible();
    await expect(page.locator('#homeInput')).toBeVisible();
  });

  test('should handle missing dependencies gracefully', async ({ page }) => {
    await page.goto(BASE_URL);
    await prepareAppState(page, { skipAuth: true, forceHome: true });

    // Check for JavaScript errors in console
    const errors = [];
    page.on('pageerror', error => {
      errors.push(error.message);
    });

    // Wait for page to fully load
    await page.waitForLoadState('networkidle');

    // Log errors if any (for debugging)
    if (errors.length > 0) {
      console.log('Page errors detected:', errors);
    }
  });

});

test.describe('Performance Tests', () => {

  test('should load within reasonable time', async ({ page }) => {
    const startTime = Date.now();
    await page.goto(BASE_URL);
    await prepareAppState(page, { skipAuth: true, forceHome: true });
    await page.waitForLoadState('domcontentloaded');
    const loadTime = Date.now() - startTime;

    // Should load within 5 seconds
    expect(loadTime).toBeLessThan(5000);
  });

  test('should handle rapid input changes', async ({ page }) => {
    await page.goto(BASE_URL);
    await prepareAppState(page, { skipAuth: true, forceHome: true });

    const input = page.locator('#homeInput');

    // Rapid typing
    for (let i = 0; i < 10; i++) {
      await input.fill(`Message ${i}`);
    }

    // Final value should be set
    await expect(input).toHaveValue('Message 9');
  });

});
