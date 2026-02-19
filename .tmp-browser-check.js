const { chromium } = require('playwright');

const BASE = process.env.BASE_URL || 'https://cowork.ignitabull.org';
const issues = [];
const api = [];

async function safeAction(name, fn) {
  try {
    await fn();
    return true;
  } catch (err) {
    issues.push(`${name}: ${err.message || err}`);
    return false;
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });

  page.on('pageerror', (err) => issues.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    const t = msg.type();
    if (t === 'error' || t === 'warning') {
      issues.push(`${t}: ${msg.text()}`);
    }
  });

  page.setDefaultTimeout(8000);
  page.setDefaultNavigationTimeout(12000);

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });

  await safeAction('auth skip', async () => {
    const btn = page.locator('#authSkipBtn');
    if (await btn.isVisible().catch(() => false)) {
      await btn.click({ timeout: 1200 });
      await page.waitForTimeout(300);
    }
  });

  const states = {
    homeViewVisible: await page.locator('#homeView').isVisible(),
    homeInputVisible: await page.locator('#homeInput').isVisible(),
    sidebarVisible: await page.locator('#leftSidebar').isVisible(),
    sendBtnEnabledBefore: !(await page.locator('#homeSendBtn').isDisabled().catch(() => true)),
  };

  if (!states.homeInputVisible) issues.push('Home input missing');

  if (states.homeInputVisible) {
    await safeAction('type in input', async () => {
      await page.locator('#homeInput').fill('deploy flow check');
      await page.waitForTimeout(300);
    });
    const sendEnabled = !(await page.locator('#homeSendBtn').isDisabled().catch(() => true));
    states.sendBtnEnabledAfterType = sendEnabled;
    if (!sendEnabled) issues.push('Send button not enabled after typing');

    await safeAction('send message', async () => {
      await page.locator('#homeSendBtn').click();
      await page.waitForTimeout(600);
    });
  }

  await safeAction('open provider', async () => {
    const sel = page.locator('#homeProviderDropdown .provider-selector');
    if (await sel.isVisible().catch(() => false)) {
      await sel.click();
      await page.waitForTimeout(300);
      if (!(await page.locator('#homeProviderDropdown .dropdown-menu').isVisible().catch(() => false))) {
        throw new Error('provider menu not opened');
      }
    } else {
      throw new Error('provider selector not visible');
    }
  });

  await safeAction('open model', async () => {
    const sel = page.locator('#homeModelDropdown .model-selector');
    if (await sel.isVisible().catch(() => false)) {
      await sel.click();
      await page.waitForTimeout(300);
      if (!(await page.locator('#homeModelDropdown .dropdown-menu').isVisible().catch(() => false))) {
        throw new Error('model menu not opened');
      }
    } else {
      throw new Error('model selector not visible');
    }
  });

  const checks = ['/api/health','/api/config','/api/providers','/api/chats','/api/settings','/api/reports','/api/search'];
  for (const path of checks) {
    const r = await page.request.get(`${BASE}${path}`);
    api.push({ path, status: r.status() });
  }

  const summary = {
    base: BASE,
    title: await page.title().catch(() => ''),
    states,
    issues,
    api,
    ok: issues.length === 0,
  };

  console.log(JSON.stringify(summary, null, 2));
  await browser.close();
  process.exit(summary.ok ? 0 : 1);
})();
