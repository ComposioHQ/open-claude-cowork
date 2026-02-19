import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Mock playwright before importing BrowserServer ----
const mockLaunchPersistentContext = vi.fn();
const mockConnectOverCDP = vi.fn();

vi.mock('playwright', () => ({
  chromium: {
    launchPersistentContext: mockLaunchPersistentContext,
    connectOverCDP: mockConnectOverCDP,
  },
}));

// Mock fs/os modules used by server.js
vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  readdirSync: vi.fn(() => []),
  readFileSync: vi.fn(() => ''),
}));

vi.mock('os', () => ({
  homedir: vi.fn(() => '/mock/home'),
}));

// Import module under test AFTER mocks
const { default: BrowserServer } = await import(
  '../../../server/browser/server.js'
);

describe('BrowserServer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ======================================================================
  // constructor
  // ======================================================================
  describe('constructor', () => {
    it('defaults to clawd mode when no config is provided', () => {
      const bs = new BrowserServer();
      expect(bs.mode).toBe('clawd');
    });

    it('accepts chrome mode from config', () => {
      const bs = new BrowserServer({ mode: 'chrome' });
      expect(bs.mode).toBe('chrome');
    });

    it('initializes with null browser, context, and page', () => {
      const bs = new BrowserServer();
      expect(bs.browser).toBeNull();
      expect(bs.context).toBeNull();
      expect(bs.page).toBeNull();
    });

    it('initializes an empty elementRefs map and zero refCounter', () => {
      const bs = new BrowserServer();
      expect(bs.elementRefs).toBeInstanceOf(Map);
      expect(bs.elementRefs.size).toBe(0);
      expect(bs.refCounter).toBe(0);
    });

    it('stores the config object', () => {
      const config = { mode: 'clawd', clawd: { headless: true } };
      const bs = new BrowserServer(config);
      expect(bs.config).toBe(config);
    });
  });

  // ======================================================================
  // getStatus
  // ======================================================================
  describe('getStatus', () => {
    it('reports not running when context is null', () => {
      const bs = new BrowserServer();
      const status = bs.getStatus();
      expect(status).toEqual({
        running: false,
        mode: 'clawd',
        currentUrl: null,
        tabCount: 0,
      });
    });

    it('reports running when context exists', () => {
      const bs = new BrowserServer({ mode: 'chrome' });
      bs.context = {
        pages: () => [{ url: () => 'https://example.com' }],
      };
      bs.page = { url: () => 'https://example.com' };

      const status = bs.getStatus();
      expect(status).toEqual({
        running: true,
        mode: 'chrome',
        currentUrl: 'https://example.com',
        tabCount: 1,
      });
    });

    it('returns tabCount based on context.pages() length', () => {
      const bs = new BrowserServer();
      bs.context = {
        pages: () => [{}, {}, {}],
      };

      const status = bs.getStatus();
      expect(status.tabCount).toBe(3);
    });
  });

  // ======================================================================
  // escapeSelector
  // ======================================================================
  describe('escapeSelector', () => {
    it('returns empty string for null/undefined', () => {
      const bs = new BrowserServer();
      expect(bs.escapeSelector(null)).toBe('');
      expect(bs.escapeSelector(undefined)).toBe('');
      expect(bs.escapeSelector('')).toBe('');
    });

    it('escapes double quotes', () => {
      const bs = new BrowserServer();
      expect(bs.escapeSelector('say "hello"')).toBe('say \\"hello\\"');
    });

    it('escapes single quotes', () => {
      const bs = new BrowserServer();
      expect(bs.escapeSelector("it's")).toBe("it\\'s");
    });

    it('escapes backslashes', () => {
      const bs = new BrowserServer();
      expect(bs.escapeSelector('path\\to\\file')).toBe('path\\\\to\\\\file');
    });

    it('passes through normal strings unchanged', () => {
      const bs = new BrowserServer();
      expect(bs.escapeSelector('Click here')).toBe('Click here');
    });
  });

  // ======================================================================
  // buildSelector
  // ======================================================================
  describe('buildSelector', () => {
    let bs;

    beforeEach(() => {
      bs = new BrowserServer();
    });

    it('maps link role to anchor tag selector', () => {
      const selector = bs.buildSelector({ role: 'link', name: '' });
      expect(selector).toBe('a');
    });

    it('maps button role to button selector', () => {
      const selector = bs.buildSelector({ role: 'button', name: '' });
      expect(selector).toBe('button, [role="button"]');
    });

    it('maps textbox role to input/textarea selector', () => {
      const selector = bs.buildSelector({ role: 'textbox', name: '' });
      expect(selector).toBe('input, textarea');
    });

    it('uses [role=...] for unmapped roles', () => {
      const selector = bs.buildSelector({ role: 'alert', name: '' });
      expect(selector).toBe('[role="alert"]');
    });

    it('includes name-based selectors when name is provided', () => {
      const selector = bs.buildSelector({
        role: 'button',
        name: 'Submit',
      });
      expect(selector).toContain(':has-text("Submit")');
      expect(selector).toContain('[aria-label="Submit"]');
      expect(selector).toContain('[placeholder="Submit"]');
    });

    it('escapes special characters in the name', () => {
      const selector = bs.buildSelector({
        role: 'link',
        name: 'It\'s "a" test',
      });
      expect(selector).toContain("It\\'s");
      expect(selector).toContain('\\"a\\"');
    });
  });

  // ======================================================================
  // start — clawd mode
  // ======================================================================
  describe('start (clawd mode)', () => {
    it('launches persistent context with correct options', async () => {
      const mockPage = {
        url: () => 'about:blank',
        title: async () => 'New Tab',
      };
      const mockContext = {
        pages: () => [mockPage],
        close: vi.fn(),
      };

      mockLaunchPersistentContext.mockResolvedValue(mockContext);

      const bs = new BrowserServer({ mode: 'clawd' });
      await bs.start();

      expect(mockLaunchPersistentContext).toHaveBeenCalledWith(
        expect.stringContaining('.open-claude-cowork-browser'),
        expect.objectContaining({
          headless: false,
          viewport: { width: 1280, height: 720 },
        })
      );
      expect(bs.context).toBe(mockContext);
      expect(bs.page).toBe(mockPage);
    });

    it('expands ~ to home directory in userDataDir', async () => {
      const mockContext = {
        pages: () => [{}],
      };
      mockLaunchPersistentContext.mockResolvedValue(mockContext);

      const bs = new BrowserServer({ mode: 'clawd' });
      await bs.start();

      const calledPath = mockLaunchPersistentContext.mock.calls[0][0];
      expect(calledPath).toMatch(/^\/mock\/home/);
      expect(calledPath).not.toContain('~');
    });

    it('uses custom userDataDir if provided', async () => {
      const mockContext = {
        pages: () => [{}],
      };
      mockLaunchPersistentContext.mockResolvedValue(mockContext);

      const bs = new BrowserServer({
        mode: 'clawd',
        clawd: { userDataDir: '/tmp/custom-browser' },
      });
      await bs.start();

      expect(mockLaunchPersistentContext).toHaveBeenCalledWith(
        '/tmp/custom-browser',
        expect.any(Object)
      );
    });

    it('creates a new page when context has no existing pages', async () => {
      const mockNewPage = { url: () => 'about:blank' };
      const mockContext = {
        pages: () => [],
        newPage: vi.fn().mockResolvedValue(mockNewPage),
      };
      mockLaunchPersistentContext.mockResolvedValue(mockContext);

      const bs = new BrowserServer({ mode: 'clawd' });
      await bs.start();

      expect(mockContext.newPage).toHaveBeenCalledOnce();
      expect(bs.page).toBe(mockNewPage);
    });

    it('respects headless config option', async () => {
      const mockContext = { pages: () => [{}] };
      mockLaunchPersistentContext.mockResolvedValue(mockContext);

      const bs = new BrowserServer({
        mode: 'clawd',
        clawd: { headless: true },
      });
      await bs.start();

      expect(mockLaunchPersistentContext).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ headless: true })
      );
    });
  });

  // ======================================================================
  // start — chrome mode
  // ======================================================================
  describe('start (chrome mode)', () => {
    it('connects over CDP with default port 9222', async () => {
      const mockPage = { url: () => 'https://google.com' };
      const mockContext = {
        pages: () => [mockPage],
      };
      const mockBrowser = {
        contexts: () => [mockContext],
      };

      mockConnectOverCDP.mockResolvedValue(mockBrowser);

      const bs = new BrowserServer({ mode: 'chrome' });
      await bs.start();

      expect(mockConnectOverCDP).toHaveBeenCalledWith(
        'http://localhost:9222'
      );
      expect(bs.browser).toBe(mockBrowser);
      expect(bs.context).toBe(mockContext);
      expect(bs.page).toBe(mockPage);
    });

    it('uses custom CDP port from config', async () => {
      const mockContext = { pages: () => [{}] };
      const mockBrowser = { contexts: () => [mockContext] };
      mockConnectOverCDP.mockResolvedValue(mockBrowser);

      const bs = new BrowserServer({
        mode: 'chrome',
        chrome: { cdpPort: 9333 },
      });
      await bs.start();

      expect(mockConnectOverCDP).toHaveBeenCalledWith(
        'http://localhost:9333'
      );
    });

    it('throws when no browser contexts are found', async () => {
      const mockBrowser = { contexts: () => [] };
      mockConnectOverCDP.mockResolvedValue(mockBrowser);

      const bs = new BrowserServer({ mode: 'chrome' });

      await expect(bs.start()).rejects.toThrow(
        'Failed to connect to Chrome CDP'
      );
    });

    it('creates a new page when no existing pages in context', async () => {
      const mockNewPage = { url: () => 'about:blank' };
      const mockContext = {
        pages: () => [],
        newPage: vi.fn().mockResolvedValue(mockNewPage),
      };
      const mockBrowser = { contexts: () => [mockContext] };
      mockConnectOverCDP.mockResolvedValue(mockBrowser);

      const bs = new BrowserServer({ mode: 'chrome' });
      await bs.start();

      expect(mockContext.newPage).toHaveBeenCalledOnce();
      expect(bs.page).toBe(mockNewPage);
    });
  });

  // ======================================================================
  // stop
  // ======================================================================
  describe('stop', () => {
    it('closes the context in clawd mode', async () => {
      const mockClose = vi.fn();
      const bs = new BrowserServer({ mode: 'clawd' });
      bs.context = { close: mockClose };
      bs.page = {};

      await bs.stop();

      expect(mockClose).toHaveBeenCalledOnce();
      expect(bs.context).toBeNull();
      expect(bs.page).toBeNull();
    });

    it('closes the browser in chrome mode', async () => {
      const browserClose = vi.fn();
      const bs = new BrowserServer({ mode: 'chrome' });
      bs.browser = { close: browserClose };
      bs.page = {};

      await bs.stop();

      expect(browserClose).toHaveBeenCalledOnce();
      expect(bs.browser).toBeNull();
    });

    it('does not close context in chrome mode', async () => {
      const contextClose = vi.fn();
      const browserClose = vi.fn();
      const bs = new BrowserServer({ mode: 'chrome' });
      bs.context = { close: contextClose };
      bs.browser = { close: browserClose };

      await bs.stop();

      // In chrome mode, context.close should NOT be called
      expect(contextClose).not.toHaveBeenCalled();
      expect(browserClose).toHaveBeenCalled();
    });

    it('handles stop when nothing was started', async () => {
      const bs = new BrowserServer();
      // Should not throw
      await expect(bs.stop()).resolves.toBeUndefined();
    });
  });

  // ======================================================================
  // getPage
  // ======================================================================
  describe('getPage', () => {
    it('returns existing page if open', async () => {
      const bs = new BrowserServer();
      const mockPage = { isClosed: () => false };
      bs.page = mockPage;

      const page = await bs.getPage();
      expect(page).toBe(mockPage);
    });

    it('gets first page from context when current page is closed', async () => {
      const replacementPage = { isClosed: () => false };
      const bs = new BrowserServer();
      bs.page = { isClosed: () => true };
      bs.context = {
        pages: () => [replacementPage],
      };

      const page = await bs.getPage();
      expect(page).toBe(replacementPage);
    });

    it('creates new page when current is null', async () => {
      const newPage = { isClosed: () => false };
      const bs = new BrowserServer();
      bs.page = null;
      bs.context = {
        pages: () => [],
        newPage: vi.fn().mockResolvedValue(newPage),
      };

      const page = await bs.getPage();
      expect(page).toBe(newPage);
      expect(bs.context.newPage).toHaveBeenCalledOnce();
    });
  });

  // ======================================================================
  // navigate
  // ======================================================================
  describe('navigate', () => {
    let bs;
    let mockPage;

    beforeEach(() => {
      bs = new BrowserServer();
      mockPage = {
        isClosed: () => false,
        url: () => 'https://example.com',
        title: async () => 'Example',
        goto: vi.fn().mockResolvedValue(undefined),
      };
      bs.page = mockPage;
    });

    it('navigates to a full https URL', async () => {
      const result = await bs.navigate('https://example.com');

      expect(mockPage.goto).toHaveBeenCalledWith('https://example.com', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      expect(result).toEqual({ url: 'https://example.com', title: 'Example' });
    });

    it('adds https:// when protocol is missing', async () => {
      await bs.navigate('example.com');

      expect(mockPage.goto).toHaveBeenCalledWith(
        'https://example.com',
        expect.any(Object)
      );
    });

    it('preserves http:// URLs', async () => {
      await bs.navigate('http://localhost:3000');

      expect(mockPage.goto).toHaveBeenCalledWith(
        'http://localhost:3000',
        expect.any(Object)
      );
    });

    it('sanitizes bare domain input by prepending https://', async () => {
      // javascript:alert(1) does NOT start with http:// or https://,
      // so it gets https:// prepended and is treated as a hostname lookup.
      // The navigate method's protocol check only blocks URLs where the
      // parsed protocol is not http/https, which cannot happen with the
      // prepend logic. This is defense-in-depth.
      await bs.navigate('example.com/path');

      expect(mockPage.goto).toHaveBeenCalledWith(
        'https://example.com/path',
        expect.any(Object)
      );
    });

    it('calls goto with domcontentloaded wait strategy', async () => {
      await bs.navigate('https://test.com');

      expect(mockPage.goto).toHaveBeenCalledWith('https://test.com', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
    });
  });

  // ======================================================================
  // click
  // ======================================================================
  describe('click', () => {
    let bs;
    let mockPage;

    beforeEach(() => {
      bs = new BrowserServer();
      mockPage = {
        isClosed: () => false,
        url: () => 'https://example.com',
        click: vi.fn().mockResolvedValue(undefined),
        waitForLoadState: vi.fn().mockResolvedValue(undefined),
      };
      bs.page = mockPage;
    });

    it('clicks by element ref when ref exists', async () => {
      bs.elementRefs.set('e5', { role: 'button', name: 'Submit' });

      const result = await bs.click('e5');

      expect(mockPage.click).toHaveBeenCalledWith(
        expect.stringContaining('Submit'),
        expect.objectContaining({ timeout: 5000 })
      );
      expect(result).toEqual({ success: true, url: 'https://example.com' });
    });

    it('throws when element ref is not found', async () => {
      await expect(bs.click('e99')).rejects.toThrow(
        'Element ref "e99" not found'
      );
    });

    it('clicks by text content for non-ref targets', async () => {
      await bs.click('Sign In');

      // Should have tried text-based selectors
      expect(mockPage.click).toHaveBeenCalled();
    });

    it('throws when no matching element is found for text target', async () => {
      mockPage.click.mockRejectedValue(new Error('timeout'));

      await expect(bs.click('Nonexistent Button')).rejects.toThrow(
        'Could not find element'
      );
    });
  });

  // ======================================================================
  // type
  // ======================================================================
  describe('type', () => {
    let bs;
    let mockPage;

    beforeEach(() => {
      bs = new BrowserServer();
      mockPage = {
        isClosed: () => false,
        type: vi.fn().mockResolvedValue(undefined),
        fill: vi.fn().mockResolvedValue(undefined),
      };
      bs.page = mockPage;
    });

    it('types into element by ref', async () => {
      bs.elementRefs.set('e3', { role: 'textbox', name: 'Search' });

      const result = await bs.type('e3', 'hello world');

      expect(mockPage.type).toHaveBeenCalledWith(
        expect.stringContaining('Search'),
        'hello world',
        expect.objectContaining({ timeout: 5000 })
      );
      expect(result).toEqual({ success: true });
    });

    it('uses fill when clear option is true', async () => {
      bs.elementRefs.set('e3', { role: 'textbox', name: 'Search' });

      await bs.type('e3', 'new text', { clear: true });

      expect(mockPage.fill).toHaveBeenCalled();
      expect(mockPage.type).not.toHaveBeenCalled();
    });

    it('throws when ref is not found', async () => {
      await expect(bs.type('e99', 'text')).rejects.toThrow(
        'Element ref "e99" not found'
      );
    });
  });

  // ======================================================================
  // press
  // ======================================================================
  describe('press', () => {
    it('presses a keyboard key', async () => {
      const bs = new BrowserServer();
      const mockPress = vi.fn();
      bs.page = {
        isClosed: () => false,
        keyboard: { press: mockPress },
      };

      const result = await bs.press('Enter');

      expect(mockPress).toHaveBeenCalledWith('Enter');
      expect(result).toEqual({ success: true });
    });
  });

  // ======================================================================
  // screenshot
  // ======================================================================
  describe('screenshot', () => {
    it('takes a screenshot and returns base64 data', async () => {
      const bs = new BrowserServer();
      const fakeBuffer = Buffer.from('fake-png-data');
      bs.page = {
        isClosed: () => false,
        screenshot: vi.fn().mockResolvedValue(fakeBuffer),
      };

      const result = await bs.screenshot();

      expect(bs.page.screenshot).toHaveBeenCalledWith({
        fullPage: false,
        type: 'png',
      });
      expect(result).toEqual({
        data: fakeBuffer.toString('base64'),
        mimeType: 'image/png',
      });
    });

    it('supports fullPage option', async () => {
      const bs = new BrowserServer();
      bs.page = {
        isClosed: () => false,
        screenshot: vi.fn().mockResolvedValue(Buffer.from('')),
      };

      await bs.screenshot({ fullPage: true });

      expect(bs.page.screenshot).toHaveBeenCalledWith({
        fullPage: true,
        type: 'png',
      });
    });
  });

  // ======================================================================
  // getTabs / switchTab / newTab / closeTab
  // ======================================================================
  describe('tab management', () => {
    it('getTabs returns tab info for all pages', async () => {
      const bs = new BrowserServer();
      const page1 = {
        url: () => 'https://a.com',
        title: async () => 'A',
      };
      const page2 = {
        url: () => 'https://b.com',
        title: async () => 'B',
      };
      bs.page = page1;
      bs.context = { pages: () => [page1, page2] };

      const tabs = await bs.getTabs();

      expect(tabs).toEqual([
        { index: 0, url: 'https://a.com', title: 'A', active: true },
        { index: 1, url: 'https://b.com', title: 'B', active: false },
      ]);
    });

    it('switchTab switches to specified index', async () => {
      const bs = new BrowserServer();
      const page1 = { url: () => 'https://a.com', title: async () => 'A', bringToFront: vi.fn() };
      const page2 = { url: () => 'https://b.com', title: async () => 'B', bringToFront: vi.fn() };
      bs.context = { pages: () => [page1, page2] };

      const result = await bs.switchTab(1);

      expect(page2.bringToFront).toHaveBeenCalled();
      expect(bs.page).toBe(page2);
      expect(result).toEqual({ url: 'https://b.com', title: 'B' });
    });

    it('switchTab throws for out-of-range index', async () => {
      const bs = new BrowserServer();
      bs.context = { pages: () => [{}] };

      await expect(bs.switchTab(5)).rejects.toThrow('out of range');
    });

    it('switchTab throws for negative index', async () => {
      const bs = new BrowserServer();
      bs.context = { pages: () => [{}] };

      await expect(bs.switchTab(-1)).rejects.toThrow('out of range');
    });

    it('newTab creates a new page via context', async () => {
      const bs = new BrowserServer();
      const newPage = {
        url: () => 'about:blank',
        title: async () => '',
      };
      bs.context = { newPage: vi.fn().mockResolvedValue(newPage) };

      const result = await bs.newTab();

      expect(bs.context.newPage).toHaveBeenCalled();
      expect(bs.page).toBe(newPage);
      expect(result.url).toBe('about:blank');
    });

    it('closeTab closes current page and switches to last remaining', async () => {
      const bs = new BrowserServer();
      const remaining = {
        url: () => 'https://remaining.com',
        title: async () => 'Remaining',
      };
      const closingPage = { close: vi.fn() };
      bs.page = closingPage;
      bs.context = { pages: () => [remaining], newPage: vi.fn() };

      const result = await bs.closeTab();

      expect(closingPage.close).toHaveBeenCalled();
      expect(bs.page).toBe(remaining);
      expect(result.url).toBe('https://remaining.com');
    });
  });

  // ======================================================================
  // waitFor
  // ======================================================================
  describe('waitFor', () => {
    it('waits for text when type is "text"', async () => {
      const bs = new BrowserServer();
      bs.page = {
        isClosed: () => false,
        waitForSelector: vi.fn().mockResolvedValue(undefined),
      };

      const result = await bs.waitFor('Loading complete', { type: 'text' });

      expect(bs.page.waitForSelector).toHaveBeenCalledWith(
        'text="Loading complete"',
        { timeout: 10000 }
      );
      expect(result).toEqual({ success: true });
    });

    it('uses custom timeout', async () => {
      const bs = new BrowserServer();
      bs.page = {
        isClosed: () => false,
        waitForSelector: vi.fn().mockResolvedValue(undefined),
      };

      await bs.waitFor('.my-class', { timeout: 5000 });

      expect(bs.page.waitForSelector).toHaveBeenCalledWith('.my-class', {
        timeout: 5000,
      });
    });

    it('rejects selectors containing javascript:', async () => {
      const bs = new BrowserServer();
      bs.page = { isClosed: () => false };

      await expect(
        bs.waitFor('javascript:alert(1)')
      ).rejects.toThrow('Invalid selector');
    });

    it('rejects selectors containing data:', async () => {
      const bs = new BrowserServer();
      bs.page = { isClosed: () => false };

      await expect(
        bs.waitFor('data:text/html,<h1>hello</h1>')
      ).rejects.toThrow('Invalid selector');
    });
  });
});
