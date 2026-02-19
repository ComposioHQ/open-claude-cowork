import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

/**
 * BrowserServer - Core browser automation server
 * Supports two modes:
 * - 'clawd': Managed isolated browser with dedicated profile
 * - 'chrome': CDP connection to existing Chrome instance
 */
export default class BrowserServer {
  constructor(config = {}) {
    this.mode = config.mode || 'clawd'
    this.config = config
    this.browser = null
    this.context = null
    this.page = null
    this.elementRefs = new Map()
    this.refCounter = 0
  }

  /**
   * Start the browser based on mode
   */
  async start() {
    if (this.mode === 'clawd') {
      await this.startClawdBrowser()
    } else if (this.mode === 'chrome') {
      await this.connectToChrome()
    }
    return this
  }

  /**
   * Launch isolated Chromium with dedicated profile
   */
  async startClawdBrowser() {
    let chromium
    try {
      const pw = await import('playwright')
      chromium = pw.chromium
    } catch (err) {
      throw new Error('Playwright is not installed. Run: cd server && npm install playwright')
    }

    const clawdConfig = this.config.clawd || {}
    let userDataDir = clawdConfig.userDataDir || '~/.open-claude-cowork-browser'

    // Expand ~ to home directory
    if (userDataDir.startsWith('~')) {
      userDataDir = join(homedir(), userDataDir.slice(1))
    }

    console.log('[BrowserServer] Launching browser with profile:', userDataDir)

    try {
      this.context = await chromium.launchPersistentContext(userDataDir, {
        headless: clawdConfig.headless ?? false,
        viewport: { width: 1280, height: 720 },
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-first-run',
          '--no-default-browser-check'
        ]
      })
    } catch (err) {
      if (err.message.includes('Executable doesn\'t exist') || err.message.includes('browserType.launchPersistentContext')) {
        throw new Error('Playwright browsers not installed. Run: npx playwright install chromium')
      }
      throw err
    }

    // Get or create a page
    const pages = this.context.pages()
    this.page = pages.length > 0 ? pages[0] : await this.context.newPage()

    console.log('[BrowserServer] Browser started')
  }

  /**
   * Connect to existing Chrome via CDP
   */
  async connectToChrome() {
    let chromium
    try {
      const pw = await import('playwright')
      chromium = pw.chromium
    } catch (err) {
      throw new Error('Playwright is not installed. Run: cd server && npm install playwright')
    }

    const chromeConfig = this.config.chrome || {}
    const cdpPort = chromeConfig.cdpPort || 9222

    console.log('[BrowserServer] Connecting to Chrome CDP on port:', cdpPort)

    try {
      this.browser = await chromium.connectOverCDP(`http://localhost:${cdpPort}`)
      const contexts = this.browser.contexts()

      if (contexts.length === 0) {
        throw new Error('No browser contexts found. Make sure Chrome is running with --remote-debugging-port=' + cdpPort)
      }

      this.context = contexts[0]
      const pages = this.context.pages()
      this.page = pages.length > 0 ? pages[0] : await this.context.newPage()

      console.log('[BrowserServer] Connected to Chrome, found', pages.length, 'tabs')
    } catch (err) {
      throw new Error(`Failed to connect to Chrome CDP: ${err.message}. Start Chrome with: google-chrome --remote-debugging-port=${cdpPort}`)
    }
  }

  /**
   * Stop the browser
   */
  async stop() {
    if (this.context && this.mode === 'clawd') {
      await this.context.close()
    }
    if (this.browser) {
      await this.browser.close()
    }
    this.browser = null
    this.context = null
    this.page = null
    console.log('[BrowserServer] Stopped')
  }

  /**
   * Get current page, ensuring we have one
   */
  async getPage() {
    if (!this.page || this.page.isClosed()) {
      const pages = this.context.pages()
      this.page = pages.length > 0 ? pages[0] : await this.context.newPage()
    }
    return this.page
  }

  /**
   * Navigate to URL
   */
  async navigate(url) {
    const page = await this.getPage()

    // Add protocol if missing
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url
    }

    // Validate URL to prevent javascript:, file:, etc.
    try {
      const parsed = new URL(url)
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error(`Invalid URL protocol: ${parsed.protocol}. Only HTTP/HTTPS allowed.`)
      }
    } catch (err) {
      if (err.message.includes('Invalid URL')) {
        throw new Error(`Invalid URL: ${url}`)
      }
      throw err
    }

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    return {
      url: page.url(),
      title: await page.title()
    }
  }

  /**
   * Get accessibility tree snapshot with element refs
   */
  async snapshot(options = {}) {
    const page = await this.getPage()
    this.elementRefs.clear()
    this.refCounter = 0

    // Get accessibility snapshot
    const snapshot = await page.accessibility.snapshot({ interestingOnly: true })

    // Build simplified tree with refs
    const processNode = (node, depth = 0) => {
      if (!node) return null

      const ref = `e${++this.refCounter}`
      const result = {
        ref,
        role: node.role,
        name: node.name || '',
      }

      // Store element info for later lookup
      this.elementRefs.set(ref, {
        role: node.role,
        name: node.name,
        description: node.description
      })

      // Add relevant properties
      if (node.value) result.value = node.value
      if (node.checked !== undefined) result.checked = node.checked
      if (node.pressed !== undefined) result.pressed = node.pressed
      if (node.selected !== undefined) result.selected = node.selected
      if (node.expanded !== undefined) result.expanded = node.expanded

      // Process children
      if (node.children && node.children.length > 0) {
        result.children = node.children
          .map(child => processNode(child, depth + 1))
          .filter(Boolean)
      }

      return result
    }

    const tree = processNode(snapshot)

    return {
      url: page.url(),
      title: await page.title(),
      tree
    }
  }

  /**
   * Get a text-based snapshot (more compact)
   */
  async textSnapshot() {
    const page = await this.getPage()
    this.elementRefs.clear()
    this.refCounter = 0

    const snapshot = await page.accessibility.snapshot({ interestingOnly: true })
    const lines = []

    const processNode = (node, indent = 0) => {
      if (!node) return

      const ref = `e${++this.refCounter}`
      const prefix = '  '.repeat(indent)

      // Store for lookup
      this.elementRefs.set(ref, {
        role: node.role,
        name: node.name,
        description: node.description
      })

      let line = `${prefix}[${ref}] ${node.role}`
      if (node.name) line += `: "${node.name}"`
      if (node.value) line += ` = "${node.value}"`

      lines.push(line)

      if (node.children) {
        for (const child of node.children) {
          processNode(child, indent + 1)
        }
      }
    }

    processNode(snapshot)

    return {
      url: page.url(),
      title: await page.title(),
      content: lines.join('\n')
    }
  }

  /**
   * Take a screenshot
   */
  async screenshot(options = {}) {
    const page = await this.getPage()
    const buffer = await page.screenshot({
      fullPage: options.fullPage ?? false,
      type: 'png'
    })
    return {
      data: buffer.toString('base64'),
      mimeType: 'image/png'
    }
  }

  /**
   * Click an element by ref or description
   */
  async click(target) {
    const page = await this.getPage()

    // Check if target is a ref like "e5"
    if (target.match(/^e\d+$/)) {
      const elementInfo = this.elementRefs.get(target)
      if (!elementInfo) {
        throw new Error(`Element ref "${target}" not found. Take a new snapshot first.`)
      }

      // Use accessibility name/role to find element
      const selector = this.buildSelector(elementInfo)
      await page.click(selector, { timeout: 5000 })
    } else {
      // Try to find by text content or aria-label
      const escaped = this.escapeSelector(target)
      const selectors = [
        `text="${escaped}"`,
        `[aria-label="${escaped}"]`,
        `button:has-text("${escaped}")`,
        `a:has-text("${escaped}")`,
        `[role="button"]:has-text("${escaped}")`
      ]

      let clicked = false
      for (const selector of selectors) {
        try {
          await page.click(selector, { timeout: 2000 })
          clicked = true
          break
        } catch (e) {
          continue
        }
      }

      if (!clicked) {
        throw new Error(`Could not find element: "${target}"`)
      }
    }

    // Wait for any navigation or network activity
    await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {})

    return { success: true, url: page.url() }
  }

  /**
   * Type text into an element
   */
  async type(target, text, options = {}) {
    const page = await this.getPage()

    if (target.match(/^e\d+$/)) {
      const elementInfo = this.elementRefs.get(target)
      if (!elementInfo) {
        throw new Error(`Element ref "${target}" not found. Take a new snapshot first.`)
      }

      const selector = this.buildSelector(elementInfo)
      if (options.clear) {
        await page.fill(selector, text, { timeout: 5000 })
      } else {
        await page.type(selector, text, { timeout: 5000 })
      }
    } else {
      // Find by placeholder, label, or name
      const escaped = this.escapeSelector(target)
      const selectors = [
        `[placeholder="${escaped}"]`,
        `[aria-label="${escaped}"]`,
        `[name="${escaped}"]`,
        `input:near(:text("${escaped}"))`,
        `textarea:near(:text("${escaped}"))`
      ]

      let typed = false
      for (const selector of selectors) {
        try {
          if (options.clear) {
            await page.fill(selector, text, { timeout: 2000 })
          } else {
            await page.type(selector, text, { timeout: 2000 })
          }
          typed = true
          break
        } catch (e) {
          continue
        }
      }

      if (!typed) {
        throw new Error(`Could not find input: "${target}"`)
      }
    }

    return { success: true }
  }

  /**
   * Press a key
   */
  async press(key) {
    const page = await this.getPage()
    await page.keyboard.press(key)
    return { success: true }
  }

  /**
   * Select option from dropdown
   */
  async select(target, value) {
    const page = await this.getPage()

    if (target.match(/^e\d+$/)) {
      const elementInfo = this.elementRefs.get(target)
      if (!elementInfo) {
        throw new Error(`Element ref "${target}" not found.`)
      }
      const selector = this.buildSelector(elementInfo)
      await page.selectOption(selector, value, { timeout: 5000 })
    } else {
      const escaped = this.escapeSelector(target)
      await page.selectOption(`select:near(:text("${escaped}"))`, value, { timeout: 5000 })
    }

    return { success: true }
  }

  /**
   * Wait for element or text
   */
  async waitFor(target, options = {}) {
    const page = await this.getPage()
    const timeout = options.timeout || 10000

    if (options.type === 'text') {
      const escaped = this.escapeSelector(target)
      await page.waitForSelector(`text="${escaped}"`, { timeout })
    } else {
      // For CSS selectors, validate it doesn't contain injection attempts
      if (target.includes('javascript:') || target.includes('data:')) {
        throw new Error('Invalid selector')
      }
      await page.waitForSelector(target, { timeout })
    }

    return { success: true }
  }

  /**
   * Get list of all tabs/pages
   */
  async getTabs() {
    const pages = this.context.pages()
    const tabs = await Promise.all(pages.map(async (page, index) => ({
      index,
      url: page.url(),
      title: await page.title().catch(() => ''),
      active: page === this.page
    })))
    return tabs
  }

  /**
   * Switch to a tab by index
   */
  async switchTab(index) {
    const pages = this.context.pages()
    if (index < 0 || index >= pages.length) {
      throw new Error(`Tab index ${index} out of range (0-${pages.length - 1})`)
    }
    this.page = pages[index]
    await this.page.bringToFront()
    return {
      url: this.page.url(),
      title: await this.page.title()
    }
  }

  /**
   * Open a new tab
   */
  async newTab(url) {
    this.page = await this.context.newPage()
    if (url) {
      await this.navigate(url)
    }
    return {
      url: this.page.url(),
      title: await this.page.title()
    }
  }

  /**
   * Close current tab
   */
  async closeTab() {
    if (this.page) {
      await this.page.close()
    }
    const pages = this.context.pages()
    this.page = pages.length > 0 ? pages[pages.length - 1] : await this.context.newPage()
    return {
      url: this.page.url(),
      title: await this.page.title()
    }
  }

  /**
   * Go back in history
   */
  async goBack() {
    const page = await this.getPage()
    await page.goBack({ waitUntil: 'domcontentloaded' })
    return {
      url: page.url(),
      title: await page.title()
    }
  }

  /**
   * Go forward in history
   */
  async goForward() {
    const page = await this.getPage()
    await page.goForward({ waitUntil: 'domcontentloaded' })
    return {
      url: page.url(),
      title: await page.title()
    }
  }

  /**
   * Reload the page
   */
  async reload() {
    const page = await this.getPage()
    await page.reload({ waitUntil: 'domcontentloaded' })
    return {
      url: page.url(),
      title: await page.title()
    }
  }

  /**
   * Escape special characters for use in CSS selectors
   */
  escapeSelector(str) {
    if (!str) return ''
    // Escape quotes and backslashes for safe use in selectors
    return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/'/g, "\\'")
  }

  /**
   * Build CSS selector from accessibility info
   */
  buildSelector(elementInfo) {
    const { role, name } = elementInfo

    // Map accessibility roles to selectors
    const roleMap = {
      'link': 'a',
      'button': 'button, [role="button"]',
      'textbox': 'input, textarea',
      'searchbox': 'input[type="search"], [role="searchbox"]',
      'combobox': 'select, [role="combobox"]',
      'checkbox': 'input[type="checkbox"]',
      'radio': 'input[type="radio"]',
      'heading': 'h1, h2, h3, h4, h5, h6'
    }

    const baseSelector = roleMap[role] || `[role="${role}"]`

    if (name) {
      // Try multiple attribute selectors
      const escaped = this.escapeSelector(name)
      return `${baseSelector}:has-text("${escaped}"), [aria-label="${escaped}"], [placeholder="${escaped}"]`
    }

    return baseSelector
  }

  /**
   * Get browser status
   */
  getStatus() {
    return {
      running: !!this.context,
      mode: this.mode,
      currentUrl: this.page?.url() || null,
      tabCount: this.context?.pages().length || 0
    }
  }
}
