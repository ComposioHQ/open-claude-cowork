const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(process.env.BASE_URL || 'https://cowork.ignitabull.org', { waitUntil: 'domcontentloaded', timeout: 60000 });
  const out = {
    title: await page.title(),
    homeView: await page.locator('#homeView').isVisible().catch(() => false),
    homeInput: await page.locator('#homeInput').isVisible().catch(() => false),
    leftSidebar: await page.locator('#leftSidebar').isVisible().catch(() => false),
    thinkingBtn: await page.locator('#homeThinkingBtn').isVisible().catch(() => false)
  };
  console.log(JSON.stringify(out));
  await browser.close();
})();
