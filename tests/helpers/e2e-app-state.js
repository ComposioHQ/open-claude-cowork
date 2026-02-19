/**
 * Shared E2E app state helper for Playwright specs.
 * Use prepareAppState(page, { skipAuth: true, forceHome: true }) to get to home view.
 */
export async function prepareAppState(page, options = { skipAuth: true }) {
  await page.waitForLoadState('domcontentloaded');

  const authView = page.locator('#authView');
  const authSkipBtn = page.locator('#authSkipBtn');
  const homeView = page.locator('#homeView');
  const chatView = page.locator('#chatView');
  const homeInput = page.locator('#homeInput');
  const forceHome = options.forceHome ?? true;
  const skipAuth = options.skipAuth ?? true;

  const forceHomeState = async () => {
    await page.evaluate(() => {
      const authView = document.getElementById('authView');
      const leftSidebar = document.getElementById('leftSidebar');
      const homeView = document.getElementById('homeView');
      const chatView = document.getElementById('chatView');
      const settingsView = document.getElementById('settingsView');
      const reportsView = document.getElementById('reportsView');
      const jobsView = document.getElementById('jobsView');
      const vaultView = document.getElementById('vaultView');
      const dbView = document.getElementById('dbView');
      if (authView) authView.classList.add('hidden');
      if (leftSidebar) leftSidebar.classList.remove('hidden');
      if (homeView) homeView.classList.remove('hidden');
      if (chatView) chatView.classList.add('hidden');
      if (settingsView) settingsView.classList.add('hidden');
      if (reportsView) reportsView.classList.add('hidden');
      if (jobsView) jobsView.classList.add('hidden');
      if (vaultView) vaultView.classList.add('hidden');
      if (dbView) dbView.classList.add('hidden');
    });
    await page.waitForTimeout(120);
  };

  const ensureHomeState = async () => {
    await page.evaluate(() => {
      const homeView = document.getElementById('homeView');
      const chatView = document.getElementById('chatView');
      const settingsView = document.getElementById('settingsView');
      const reportsView = document.getElementById('reportsView');
      const jobsView = document.getElementById('jobsView');
      const vaultView = document.getElementById('vaultView');
      const leftSidebar = document.getElementById('leftSidebar');
      const leftSidebarExpand = document.getElementById('leftSidebarExpand');
      const leftSidebarToggle = document.getElementById('leftSidebarToggle');
      if (homeView) homeView.classList.remove('hidden');
      if (chatView) chatView.classList.add('hidden');
      if (settingsView) settingsView.classList.add('hidden');
      if (reportsView) reportsView.classList.add('hidden');
      if (jobsView) jobsView.classList.add('hidden');
      if (vaultView) vaultView.classList.add('hidden');
      if (leftSidebar) leftSidebar.classList.remove('hidden', 'collapsed');
      if (leftSidebarExpand) leftSidebarExpand.classList.remove('visible');
      if (leftSidebarToggle) leftSidebarToggle.title = 'Collapse sidebar';
    });
    await page.waitForTimeout(150);
  };

  const authVisible = await authView.isVisible();
  if (authVisible) {
    if (!skipAuth) return;
    for (let attempt = 0; attempt < 80; attempt++) {
      if (!(await authView.isVisible())) break;
      if (await authSkipBtn.isVisible()) {
        await authSkipBtn.click();
        await page.waitForTimeout(300);
      } else {
        await page.waitForTimeout(300);
      }
    }
    if (await authView.isVisible()) await forceHomeState();
  }

  if (!skipAuth && (await authView.isVisible())) return;
  if (skipAuth) await forceHomeState();

  if ((await homeView.isVisible()) && (await homeInput.isVisible())) {
    await ensureHomeState();
    return;
  }
  if (!forceHome) return;

  if (await chatView.isVisible()) {
    if (await page.locator('.new-chat-sidebar-btn').isVisible()) {
      await page.locator('.new-chat-sidebar-btn').click();
    } else {
      await page.evaluate(() => {
        if (typeof window.startNewChat === 'function') window.startNewChat();
        else if (typeof window.showView === 'function') window.showView('home');
      });
    }
  } else if (!(await homeView.isVisible())) {
    await page.evaluate(() => {
      if (typeof window.showView === 'function') window.showView('home');
    });
  }

  await ensureHomeState();
  await page.evaluate(() => {
    if (typeof window.showView === 'function') window.showView('home');
    const leftSidebarEl = document.getElementById('leftSidebar');
    if (leftSidebarEl) {
      leftSidebarEl.classList.remove('hidden', 'collapsed');
      leftSidebarEl.style.width = '';
      leftSidebarEl.style.minWidth = '';
    }
  });

  await page.waitForTimeout(100);
}
