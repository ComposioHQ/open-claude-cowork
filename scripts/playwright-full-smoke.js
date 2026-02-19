const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3002';
const OUTPUT_DIR = process.env.OUTPUT_DIR || '/Users/ignitabull/Desktop/open-claude-cowork/output/playwright';

const issues = [];
const badApi = [];
const consoleProblems = [];

function addIssue(severity, area, issue, evidence = '') {
  issues.push({ severity, area, issue, evidence: String(evidence).slice(0, 500) });
}

async function screenshot(page, name) {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(OUTPUT_DIR, `${name}.png`), fullPage: true });
}

function summarize(items) {
  const map = new Map();
  for (const it of items) {
    const key = `${it.method} ${it.url} -> ${it.status}`;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return Array.from(map.entries()).map(([k, count]) => ({ key: k, count }));
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  const page = await context.newPage();

  page.on('response', (res) => {
    const url = res.url();
    if (url.includes('/api/')) {
      const status = res.status();
      const method = res.request().method();
      if (status >= 400) {
        badApi.push({ url, status, method });
      }
    }
  });

  page.on('console', (msg) => {
    if (['error', 'warning'].includes(msg.type())) {
      const text = msg.text();
      consoleProblems.push({ type: msg.type(), text });
      if (msg.type() === 'error') {
        addIssue('low', 'runtime', 'Browser console error', `${msg.type()}: ${text}`);
      }
    }
  });

  page.on('pageerror', (error) => {
    addIssue('high', 'runtime', 'Unhandled page error', error.message);
  });

  try {
    const response = await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const status = response ? response.status() : null;
    if (!status || status >= 400) {
      addIssue('blocker', 'load', 'Page navigation returned HTTP error', `status=${status}`);
    }

    await page.waitForTimeout(1200);
    await screenshot(page, '01-load');

    const backendBanner = page.locator('#backendBanner');
    if (await backendBanner.isVisible()) {
      const bannerText = (await backendBanner.textContent()).trim();
      addIssue('medium', 'backend', 'Backend banner visible', bannerText);
      await screenshot(page, 'backend-banner');
    }

    const authViewVisible = await page.locator('#authView').isVisible().catch(() => false);
    if (authViewVisible) {
      const skipBtn = page.locator('#authSkipBtn');
      if (await skipBtn.count()) {
        await skipBtn.click();
        await page.waitForTimeout(500);
        await screenshot(page, '02-auth-skipped');
      } else {
        addIssue('high', 'auth', 'Auth skip option missing', 'authView visible but authSkipBtn absent');
      }
    }

    const homeVisible = await page.locator('#homeView').isVisible().catch(() => false);
    const chatVisible = await page.locator('#chatView').isVisible().catch(() => false);

    if (!homeVisible && !chatVisible) {
      addIssue('blocker', 'load', 'No initial home/chat view found', 'Neither #homeView nor #chatView visible');
    }

    const homeInput = page.locator('#homeInput');
    const homeSendBtn = page.locator('#homeSendBtn');

    if (await homeInput.count() === 0) {
      addIssue('high', 'chat', 'Missing home input field', '#homeInput');
    } else {
      const disabledInitial = await homeSendBtn.isDisabled().catch(() => true);
      if (!disabledInitial) {
        addIssue('medium', 'chat', 'Send button active with empty input', 'homeSendBtn should be disabled initially');
      }

      const placeholder = await homeInput.getAttribute('placeholder').catch(() => '');
      if (!placeholder || !placeholder.includes('anything')) {
        addIssue('low', 'chat', 'Home input placeholder changed', `placeholder=${placeholder}`);
      }

      await homeInput.fill('Playwright smoke test message');
      await page.waitForTimeout(200);
      const enabledAfter = !(await homeSendBtn.isDisabled());
      if (!enabledAfter) {
        addIssue('medium', 'chat', 'Send button did not enable with input', 'homeSendBtn remained disabled');
      }

      await homeSendBtn.click();
      await page.waitForTimeout(1400);
      await screenshot(page, '03-after-send');

      const messages = await page.locator('.message').count();
      if (!messages) {
        addIssue('high', 'chat', 'No message elements after sending first prompt', 'Expected .message nodes in chatMessages');
      }

      const messageTexts = await page.locator('.message-content').allTextContents();
      const hasUserText = messageTexts.some((text) => text.includes('Playwright smoke test message'));
      if (!hasUserText) {
        addIssue('medium', 'chat', 'User message content not found', JSON.stringify(messageTexts.slice(0, 4)));
      }

      const chatViewVisible = await page.locator('#chatView').isVisible().catch(() => false);
      if (!chatViewVisible) {
        addIssue('high', 'chat', 'Chat view not shown after send', '#chatView not visible after send action');
      }

      if (page.locator('#chatMessages .message').count) {
        const latest = await page.locator('#chatMessages .message:last-child .message-content').textContent().catch(() => '');
        if (!latest) {
          addIssue('medium', 'chat', 'Assistant reply missing content', 'Latest message has no content');
        }
      }
    }

    const leftToggle = page.locator('#leftSidebarToggle');
    const leftExpand = page.locator('#leftSidebarExpand');
    if (await leftToggle.isVisible().catch(() => false)) {
      await leftToggle.click();
      await page.waitForTimeout(300);
      if (!(await leftExpand.isVisible().catch(() => false))) {
        addIssue('low', 'navigation', 'Sidebar collapse button failed', '#leftSidebarExpand not shown');
      }
      await leftExpand.click();
      await page.waitForTimeout(300);
      await screenshot(page, '04-sidebar-toggle');
    }

    const views = [
      { name: 'reports', button: '#reportsSidebarBtn', back: '#reportsBackBtn', unavailable: '#reportsUnavailable' },
      { name: 'jobs', button: '#jobsSidebarBtn', back: '#jobsBackBtn', unavailable: '#jobsUnavailable' },
      { name: 'vault', button: '#vaultSidebarBtn', back: '#vaultBackBtn', unavailable: '#vaultUnavailable' },
      { name: 'settings', button: '#settingsSidebarBtn', back: '#settingsBackBtn', unavailable: '#settingsUnavailable' }
    ];

    for (const item of views) {
      const btn = page.locator(item.button);
      if (!(await btn.count())) {
        addIssue('low', item.name, 'Sidebar button missing', item.button);
        continue;
      }
      await btn.click();
      await page.waitForTimeout(500);

      const viewId = `#${item.name}View`;
      const isOpen = await page.locator(viewId).isVisible().catch(() => false);
      if (!isOpen) {
        addIssue('medium', item.name, `${item.name} view did not open`, `${viewId} not visible`);
        continue;
      }

      await screenshot(page, `05-${item.name}-open`);

      if (item.unavailable && (await page.locator(item.unavailable).isVisible().catch(() => false))) {
        addIssue('medium', item.name, `${item.name} shows unavailable state`, `${item.unavailable} visible`);
      }

      if (item.name === 'settings') {
        const requiredSettings = ['#settingsSaveKeysBtn', '#settingsMcpList', '#settingsAddMcpBtn', '#settingsSaveBrowserBtn'];
        for (const sel of requiredSettings) {
          if (!(await page.locator(sel).count())) {
            addIssue('low', 'settings', 'Settings control missing', sel);
          }
        }

        const providerSelector = page.locator('#homeProviderDropdown .provider-selector');
        if (await providerSelector.count()) {
          await providerSelector.click();
          await page.waitForTimeout(200);
          const optionCount = await page.locator('#homeProviderDropdown .dropdown-item[data-value]').count();
          if (optionCount < 2) {
            addIssue('low', 'settings', 'Provider options not available', `count=${optionCount}`);
          }
          await page.locator('body').click({ force: true });
        }
      }

      const back = page.locator(item.back);
      if (await back.count()) {
        await back.click();
        await page.waitForTimeout(300);
      } else {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(150);
      }

      const backVisible = (
        await page.locator('#homeView').isVisible().catch(() => false)
      ) || (
        await page.locator('#chatView').isVisible().catch(() => false)
      );
      if (!backVisible) {
        await page.locator('#leftSidebarToggle').click().catch(() => {});
      }
      await screenshot(page, `06-${item.name}-back`);
    }

    const providerBtn = page.locator('#homeProviderDropdown .provider-selector');
    if (await providerBtn.count()) {
      await providerBtn.click();
      await page.waitForTimeout(200);
      const providerItems = await page.locator('#homeProviderDropdown .dropdown-item').count();
      if (providerItems === 0) {
        addIssue('low', 'chat controls', 'Provider menu empty', 'No dropdown items under #homeProviderDropdown');
      }
      await page.keyboard.press('Escape');
    }

    const modelBtn = page.locator('#homeModelDropdown .model-selector');
    if (await modelBtn.count()) {
      await modelBtn.click();
      await page.waitForTimeout(200);
      const modelItems = await page.locator('#homeModelDropdown .dropdown-item').count();
      if (modelItems === 0) {
        addIssue('low', 'chat controls', 'Model menu empty', 'No dropdown items under #homeModelDropdown');
      }
      await page.keyboard.press('Escape');
    }

    await screenshot(page, '07-final');

    if (consoleProblems.length) {
      addIssue('low', 'runtime', 'Console warnings/errors observed', consoleProblems.map((c) => `${c.type}:${c.text}`).slice(0, 6).join(' | '));
    }

  } catch (err) {
    addIssue('blocker', 'execution', 'Playwright run exception', err.message);
    await screenshot(page, 'run-error').catch(() => {});
  }

  const report = {
    runAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    totalIssues: issues.length,
    issues,
    badApiResponses: badApi,
    apiSummary: summarize(badApi),
    consoleErrors: consoleProblems
  };

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const reportPath = path.join(OUTPUT_DIR, 'playwright-full-smoke-summary.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(JSON.stringify(report, null, 2));
  await context.close();
  await browser.close();
})();
