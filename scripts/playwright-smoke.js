const { chromium } = require('playwright');
const fs = require('fs');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';
const issues = [];
const logs = [];

const CHAT_INPUT_SELECTOR = '#homeInput';
const CHAT_SEND_SELECTOR = '#homeSendBtn';

async function waitForVisible(page, selector, timeoutMs = 12000) {
  const end = Date.now() + timeoutMs;
  const locator = page.locator(selector);
  while (Date.now() < end) {
    if (await locator.isVisible()) {
      return true;
    }
    await page.waitForTimeout(250);
  }
  return false;
}

async function forceHomeState(page) {
  await page.evaluate(() => {
    const authView = document.getElementById('authView');
    const leftSidebar = document.getElementById('leftSidebar');
    const homeView = document.getElementById('homeView');
    const chatView = document.getElementById('chatView');
    const settingsView = document.getElementById('settingsView');
    const reportsView = document.getElementById('reportsView');
    const jobsView = document.getElementById('jobsView');
    const vaultView = document.getElementById('vaultView');

    if (authView) authView.classList.add('hidden');
    if (leftSidebar) leftSidebar.classList.remove('hidden');
    if (homeView) homeView.classList.remove('hidden');
    if (chatView) chatView.classList.add('hidden');
    if (settingsView) settingsView.classList.add('hidden');
    if (reportsView) reportsView.classList.add('hidden');
    if (jobsView) jobsView.classList.add('hidden');
    if (vaultView) vaultView.classList.add('hidden');
  });

  await page.waitForTimeout(100);
  await page.evaluate(() => {
    if (typeof window.showView === 'function') {
      window.showView('home');
    }
  });
  await page.waitForTimeout(200);
}

async function prepareForSmoke(page) {
  const authView = page.locator('#authView');
  const authSkipBtn = page.locator('#authSkipBtn');

  if (await authView.isVisible()) {
    let attempts = 0;
    while ((await authView.isVisible()) && attempts < 60) {
      attempts += 1;
      if (await authSkipBtn.isVisible()) {
        await authSkipBtn.click();
      }
      await page.waitForTimeout(150);
    }
  }

  await forceHomeState(page);

  if (!(await waitForVisible(page, CHAT_INPUT_SELECTOR, 15000))) {
    issues.push({
      severity: 'high',
      area: 'smoke script',
      issue: 'Home input not found',
      evidence: 'Expected #homeInput to be visible after auth and view reset'
    });
    return false;
  }

  return true;
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  const page = await context.newPage();

  const badResponses = [];
  page.on('response', (res) => {
    const url = res.url();
    if (url.includes('/api/')) {
      const status = res.status();
      if (status >= 400) {
        badResponses.push({ url, status });
      }
    }
  });

  page.on('pageerror', (error) => {
    issues.push({
      severity: 'high',
      area: 'runtime',
      issue: 'Unhandled page error',
      evidence: error.message
    });
  });

  page.on('console', (msg) => {
    const text = msg.text();
    if (['error', 'warning'].includes(msg.type())) {
      logs.push({ type: msg.type(), text });
    }
  });

  const snap = async (name) => {
    fs.mkdirSync('output/playwright', { recursive: true });
    await page.screenshot({ path: `output/playwright/${name}.png`, fullPage: true });
  };

  try {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
  } catch (err) {
    issues.push({
      severity: 'blocker',
      area: 'load',
      issue: 'App failed to load',
      evidence: err.message
    });
    await snap('01-load-failed');
    await browser.close();
    console.log(JSON.stringify({ issues, logs }, null, 2));
    return;
  }

  const isHomeUsable = await prepareForSmoke(page);
  if (!isHomeUsable) {
    await snap('01-home');
    await browser.close();
    const summary = {
      runAt: new Date().toISOString(),
      totalIssues: issues.length,
      issues,
      badApiResponses: badResponses,
      consoleWarnings: logs
    };
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  await snap('01-home');

  const homeView = page.locator('#homeView');
  const chatView = page.locator('#chatView');
  const homeViewHidden = await homeView.evaluate((el) => el.classList.contains('hidden'));
  const chatViewHidden = await chatView.evaluate((el) => el.classList.contains('hidden'));

  if (!homeViewHidden) {
    const greetingExists = await page.locator('.greeting-text').count();
    if (!greetingExists) {
      issues.push({
        severity: 'medium',
        area: 'home',
        issue: 'Home view shown without greeting heading',
        evidence: 'Expected .greeting-text missing from initial view'
      });
    }
  } else if (!chatViewHidden) {
    issues.push({
      severity: 'low',
      area: 'home',
      issue: 'Chat view visible on first load',
      evidence: '#chatView visible before any user action'
    });
  }

  const backendBanner = page.locator('#backendBanner');
  if ((await backendBanner.count()) && await backendBanner.isVisible()) {
    const bannerText = await backendBanner.locator('strong').textContent();
    if (bannerText) {
      issues.push({
        severity: 'medium',
        area: 'backend',
        issue: 'Backend banner is visible on startup',
        evidence: bannerText.trim()
      });
      await page.screenshot({ path: 'output/playwright/02-backend-banner.png', fullPage: true });
    }
  }

  const sendBtnDisabledInitially = await page.locator(CHAT_SEND_SELECTOR).isDisabled();
  const inputValueInitially = await page.locator(CHAT_INPUT_SELECTOR).inputValue();
  if (!sendBtnDisabledInitially || inputValueInitially !== '') {
    issues.push({
      severity: 'low',
      area: 'chat',
      issue: 'Send button should be disabled with empty input',
      evidence: `disabled=${sendBtnDisabledInitially}, input="${inputValueInitially}"`
    });
  }

  await page.fill(CHAT_INPUT_SELECTOR, 'Integration smoke test message');
  const sendEnabled = (await page.locator(CHAT_SEND_SELECTOR).isDisabled()) === false;
  if (!sendEnabled) {
    issues.push({
      severity: 'medium',
      area: 'chat',
      issue: 'Send button does not enable when message typed',
      evidence: 'homeSendBtn remains disabled after entering text'
    });
  }

  await page.click(CHAT_SEND_SELECTOR);
  await page.waitForTimeout(2000);
  await snap('03-message-send');

  const anyMessage = await page.locator('.message').first().waitFor({ timeout: 12000 }).then(() => true).catch(() => false);
  if (!anyMessage) {
    issues.push({
      severity: 'high',
      area: 'chat',
      issue: 'No message rendered after clicking send',
      evidence: 'Expected .message elements in chat or home response area'
    });
  } else {
    const msgs = await page.locator('.message .message-content').allTextContents();
    const hasUserText = msgs.some((t) => t.includes('Integration smoke test message'));
    if (!hasUserText) {
      issues.push({
        severity: 'medium',
        area: 'chat',
        issue: 'Sent message not reflected in message list',
        evidence: JSON.stringify(msgs.slice(0, 3))
      });
    }

    const hasAssistantText = msgs.some((t) => t.toLowerCase().includes('message') || t.toLowerCase().includes('error'));
    if (!hasAssistantText) {
      issues.push({
        severity: 'medium',
        area: 'chat',
        issue: 'No assistant reply or error text rendered after send',
        evidence: 'Only user content or no content found'
      });
    }
  }

  const chatVisibleAfterSend = await chatView.evaluate((el) => !el.classList.contains('hidden'));
  if (!chatVisibleAfterSend) {
    issues.push({
      severity: 'medium',
      area: 'chat',
      issue: 'Chat view did not activate after sending first message',
      evidence: '#chatView remained hidden'
    });
  }

  const sideViews = [
    { id: '#reportsSidebarBtn', back: '#reportsBackBtn', name: 'reports' },
    { id: '#jobsSidebarBtn', back: '#jobsBackBtn', name: 'jobs' },
    { id: '#vaultSidebarBtn', back: '#vaultBackBtn', name: 'vault' },
    { id: '#settingsSidebarBtn', back: '#settingsBackBtn', name: 'settings' }
  ];

  for (const view of sideViews) {
    const btn = page.locator(view.id);
    const visible = await btn.count() > 0 && await btn.isVisible();
    if (!visible) {
      issues.push({
        severity: 'low',
        area: view.name,
        issue: `${view.name} button not visible`,
        evidence: `${view.id} missing or hidden`
      });
      continue;
    }

    await btn.click();
    await page.waitForTimeout(700);

    if (view.name === 'jobs') {
      const unavailable = await page.locator('#jobsUnavailable').isVisible().catch(() => false);
      if (unavailable) {
        issues.push({
          severity: 'medium',
          area: 'jobs',
          issue: 'Jobs API appears unavailable for this environment',
          evidence: 'jobsUnavailable state shown'
        });
      }
    }

    if (view.name === 'vault') {
      const unavailable = await page.locator('#vaultUnavailable').isVisible().catch(() => false);
      if (unavailable) {
        issues.push({
          severity: 'low',
          area: 'vault',
          issue: 'Vault API requires Supabase and is unavailable in this environment',
          evidence: 'vaultUnavailable state shown'
        });
      }
    }

    const hasSettings = view.name === 'settings';
    if (hasSettings) {
      const hasSectionTitle = await page.locator('#settingsView .settings-section-title').count();
      if (!hasSectionTitle) {
        issues.push({
          severity: 'low',
          area: 'settings',
          issue: 'Settings view loaded but core controls missing',
          evidence: 'settings-section-title not found'
        });
      }

      const hasExpectedControls = await page.locator('#settingsSaveKeysBtn').isVisible().catch(() => false) ||
        await page.locator('#settingsAddMcpBtn').isVisible().catch(() => false) ||
        await page.locator('#settingsSaveBrowserBtn').isVisible().catch(() => false);
      if (!hasExpectedControls) {
        issues.push({
          severity: 'low',
          area: 'settings',
          issue: 'Settings controls not interactive',
          evidence: 'No known settings action button found'
        });
      }
    }

    const backLocator = page.locator(view.back);
    const backVisible = await backLocator.count() > 0;
    if (backVisible) {
      await backLocator.click();
      await page.waitForTimeout(500);
      await snap(`04-${view.name}-back`);
    } else {
      await page.keyboard.press('Escape');
      issues.push({
        severity: 'low',
        area: view.name,
        issue: `Could not return from ${view.name} view`,
        evidence: `${view.back} missing`
      });
    }
  }

  const reportsBtn = page.locator('#reportsSidebarBtn');
  if (await reportsBtn.count()) {
    await page.locator('#reportsSidebarBtn').click();
    await page.waitForTimeout(500);
    await page.click('#reportsBackBtn');
    await page.waitForTimeout(300);
  }

  const leftToggle = page.locator('#leftSidebarToggle');
  if (await leftToggle.count()) {
    await leftToggle.click();
    await page.waitForTimeout(300);
    await page.locator('#leftSidebarExpand').click();
    await page.waitForTimeout(300);
    await snap('05-sidebar-toggle');
  }

  const providerSelector = page.locator('#homeProviderDropdown .provider-selector');
  if (await providerSelector.count() && await providerSelector.isVisible()) {
    await providerSelector.click();
    let claudeOption = page.locator('#homeProviderDropdown .provider-menu .dropdown-item[data-value="claude"]');
    if (!(await claudeOption.count())) {
      claudeOption = page.locator('#homeProviderDropdown .dropdown-menu .dropdown-item[data-value="claude"]');
    }
    if (!(await claudeOption.count())) {
      issues.push({
        severity: 'low',
        area: 'chat controls',
        issue: 'Provider dropdown missing Claude option',
        evidence: `claude=${await claudeOption.count()}`
      });
    }
  }
  await page.click('body', { position: { x: 0, y: 0 } });

  if (badResponses.length) {
    const top = badResponses.slice(0, 12);
    issues.push({
      severity: 'medium',
      area: 'api',
      issue: 'Backend API returned errors',
      evidence: JSON.stringify(top)
    });
  }

  const finalModelLabel = await page.locator('#homeModelDropdown .model-label').first().textContent();
  if (!finalModelLabel || !finalModelLabel.trim()) {
    issues.push({
      severity: 'low',
      area: 'chat controls',
      issue: 'Model label missing',
      evidence: 'No text in home model label button'
    });
  }

  await snap('06-final');
  await browser.close();

  const summary = {
    runAt: new Date().toISOString(),
    totalIssues: issues.length,
    issues,
    badApiResponses: badResponses,
    consoleWarnings: logs
  };
  console.log(JSON.stringify(summary, null, 2));
}

run().catch(async (err) => {
  console.error('FATAL', err);
  process.exitCode = 1;
});
