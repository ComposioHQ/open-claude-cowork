#!/usr/bin/env node

import { createInterface } from 'readline'
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'
import { execSync, spawn } from 'child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CONFIG_PATH = path.join(__dirname, 'config.js')

const rl = createInterface({
  input: process.stdin,
  output: process.stdout
})

const prompt = (q) => new Promise(resolve => rl.question(q, resolve))

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m'
}

function print(msg, color = '') {
  console.log(color + msg + colors.reset)
}

function printHeader() {
  console.log('')
  try {
    let logo = execSync('npx oh-my-logo CLAWD fire --filled --color', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    })
    logo = logo.replace(/\x1b\[0m\x1b\[\?25h\x1b\[K[\s\n]*/g, '\n').trimEnd()
    console.log(logo)
  } catch (err) {
    print('  CLAWD CLI', colors.red + colors.bold)
  }
  print('  WhatsApp • Telegram • Signal • iMessage', colors.red)
  console.log('')
}

async function mainMenu() {
  printHeader()

  print('What would you like to do?\n', colors.bold)
  print('  1) Terminal chat', colors.red)
  print('  2) Start gateway', colors.green)
  print('  3) Setup adapters', colors.blue)
  print('  4) Configure browser', colors.cyan)
  print('  5) Show current config', colors.yellow)
  print('  6) Test connection', colors.cyan)
  print('  7) Exit\n', colors.dim)

  const choice = await prompt('Enter choice (1-7): ')

  switch (choice.trim()) {
    case '1':
      await terminalChat()
      break
    case '2':
      await startGateway()
      break
    case '3':
      await setupWizard()
      break
    case '4':
      await browserSetup()
      break
    case '5':
      showConfig()
      await mainMenu()
      break
    case '6':
      await testConnection()
      break
    case '7':
      print('\nGoodbye!\n', colors.red)
      rl.close()
      process.exit(0)
    default:
      print('\nInvalid choice, try again.\n', colors.red)
      await mainMenu()
  }
}

async function startGateway() {
  print('\n🚀 Starting Clawd Gateway...\n', colors.green)
  rl.close()

  // Dynamic import to start the gateway
  await import('./gateway.js')
}

async function terminalChat() {
  print('\nStarting Terminal Chat...\n', colors.red)
  print('Initializing agent with all MCP servers...', colors.dim)

  try {
    // Import required modules
    const { default: ClaudeAgent } = await import('./agent/claude-agent.js')
    const { default: config } = await import('./config.js')
    const { Composio } = await import('@composio/core')

    // Initialize MCP servers
    const mcpServers = {}

    // Initialize Composio
    try {
      const composio = new Composio()
      const session = await composio.create(config.agentId || 'clawd-terminal')
      mcpServers.composio = {
        type: 'http',
        url: session.mcp.url,
        headers: session.mcp.headers
      }
      print('  ✅ Composio ready', colors.green)
    } catch (err) {
      print('  ⚠️  Composio: ' + err.message, colors.yellow)
    }

    let browserServer = null
    if (config.browser?.enabled) {
      try {
        const { BrowserServer, createBrowserMcpServer } = await import('./browser/index.js')
        browserServer = new BrowserServer(config.browser)
        // Don't start browser here - it will start lazily when agent calls a browser tool
        mcpServers.browser = createBrowserMcpServer(browserServer)
        print(`  ✅ Browser ready`, colors.green)
      } catch (err) {
        print('  ⚠️  Browser: ' + err.message, colors.yellow)
        if (config.browser.mode === 'chrome') {
          print('     Start Chrome with: --remote-debugging-port=' + (config.browser.chrome?.cdpPort || 9222), colors.dim)
        }
      }
    }

    // Create agent
    const agent = new ClaudeAgent({
      allowedTools: config.agent?.allowedTools || ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'],
      maxTurns: config.agent?.maxTurns || 50
    })

    // Handle cron job executions in terminal
    agent.cronScheduler.on('execute', async ({ jobId, message, invokeAgent }) => {
      process.stdout.write('\n\n')
      console.log(colors.yellow + '⏰ [Scheduled] ' + colors.reset + colors.cyan + message + colors.reset)
      console.log(colors.dim + `   (job: ${jobId})${invokeAgent ? ' [invoking agent]' : ''}` + colors.reset)

      // Play system sound and show desktop notification (macOS)
      try {
        const safeMessage = String(message).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
        const script = `display notification "${safeMessage}" with title "Clawd" sound name "Glass"`
        const soundProc = spawn('afplay', ['/System/Library/Sounds/Glass.aiff'], { stdio: 'ignore', detached: true })
        soundProc.unref()
        spawn('osascript', ['-e', script], { stdio: 'ignore' })
      } catch (e) {
        process.stdout.write('\x07')
      }

      // If invokeAgent is true, run the agent with the message
      if (invokeAgent) {
        try {
          process.stdout.write(colors.cyan + '\n🤖 Clawd: ' + colors.reset)
          for await (const chunk of agent.run({
            message,
            sessionKey,
            platform: 'terminal',
            mcpServers
          })) {
            if (chunk.type === 'text' && chunk.content) {
              process.stdout.write(chunk.content)
            } else if (chunk.type === 'tool_use') {
              process.stdout.write(colors.yellow + `\n🔧 ${chunk.name}` + colors.reset)
            } else if (chunk.type === 'tool_result') {
              process.stdout.write(colors.dim + ' ✓' + colors.reset)
            }
          }
          console.log('')
        } catch (err) {
          console.log(colors.red + '\nError: ' + err.message + colors.reset)
        }
      }

      // Re-show prompt after cron output
      process.stdout.write('\nYou: ')
    })

    print('\nChat started! Type "exit" or "quit" to end.\n', colors.red + colors.bold)
    print('─'.repeat(50), colors.dim)

    const sessionKey = `terminal:${Date.now()}`

    // Chat loop
    while (true) {
      const input = await prompt('\nYou: ')

      if (!input.trim()) continue
      if (['exit', 'quit', '/exit', '/quit'].includes(input.trim().toLowerCase())) {
        print('\nGoodbye!\n', colors.red)
        agent.stopCron()
        break
      }

      try {
        // Pause readline during agent execution to prevent interference
        rl.pause()

        let isFirstText = true
        let lastWasToolUse = false

        for await (const chunk of agent.run({
          message: input,
          sessionKey,
          platform: 'terminal',
          mcpServers
        })) {
          if (chunk.type === 'tool_use') {
            // Show tool being called
            process.stdout.write(colors.yellow + `\n🔧 ${chunk.name}` + colors.reset)
            lastWasToolUse = true
            isFirstText = true  // Reset so next text gets header
          } else if (chunk.type === 'tool_result') {
            // Tool completed - show brief indicator
            process.stdout.write(colors.dim + ' ✓' + colors.reset)
          } else if (chunk.type === 'text' && chunk.content) {
            // Stream text as it arrives
            if (isFirstText) {
              if (lastWasToolUse) {
                process.stdout.write('\n')
              }
              process.stdout.write(colors.cyan + '\n🤖 Clawd: ' + colors.reset)
              isFirstText = false
              lastWasToolUse = false
            }
            process.stdout.write(chunk.content)
          }
        }

        // Ensure newline at end
        console.log('')

        rl.resume()
      } catch (err) {
        rl.resume()
        print('\nError: ' + err.message, colors.red)
      }
    }

    // Cleanup browser server
    if (browserServer) {
      print('Closing browser...', colors.dim)
      await browserServer.stop()
    }
  } catch (err) {
    print('\nFailed to start chat: ' + err.message, colors.red)
  }

  rl.close()
  process.exit(0)
}

function wordWrap(text, width) {
  const lines = []
  const paragraphs = text.split('\n')

  for (const para of paragraphs) {
    if (para.length <= width) {
      lines.push(para)
      continue
    }

    let line = ''
    const words = para.split(' ')
    for (const word of words) {
      if ((line + word).length > width) {
        lines.push(line.trim())
        line = ''
      }
      line += word + ' '
    }
    if (line.trim()) lines.push(line.trim())
  }

  return lines.join('\n')
}

function showConfig() {
  print('\n📋 Current Configuration:\n', colors.yellow)

  try {
    // Read and display config
    const configContent = readFileSync(CONFIG_PATH, 'utf-8')

    // Parse out the config object (simple extraction)
    const lines = configContent.split('\n')
    for (const line of lines) {
      if (line.includes('enabled:')) {
        const enabled = line.includes('true')
        const platform = getPlatformFromContext(lines, lines.indexOf(line))
        print(`  ${platform}: ${enabled ? '✅ Enabled' : '❌ Disabled'}`, enabled ? colors.green : colors.dim)
      }
    }
    console.log('')
  } catch (err) {
    print('Could not read config: ' + err.message, colors.red)
  }
}

function getPlatformFromContext(lines, index) {
  for (let i = index; i >= 0; i--) {
    if (lines[i].includes('whatsapp:')) return 'WhatsApp'
    if (lines[i].includes('telegram:')) return 'Telegram'
    if (lines[i].includes('signal:')) return 'Signal'
    if (lines[i].includes('imessage:')) return 'iMessage'
  }
  return 'Unknown'
}

async function setupWizard() {
  print('\n🔧 Adapter Setup Wizard\n', colors.blue)
  print('Which adapter would you like to configure?\n')
  print('  1) WhatsApp (scan QR code)')
  print('  2) Telegram (bot token)')
  print('  3) Signal (signal-cli)')
  print('  4) iMessage (macOS only)')
  print('  5) Back to main menu\n')

  const choice = await prompt('Enter choice (1-5): ')

  switch (choice.trim()) {
    case '1':
      await setupWhatsApp()
      break
    case '2':
      await setupTelegram()
      break
    case '3':
      await setupSignal()
      break
    case '4':
      await setupiMessage()
      break
    case '5':
      await mainMenu()
      return
    default:
      print('\nInvalid choice.\n', colors.red)
  }

  await setupWizard()
}

async function setupWhatsApp() {
  print('\n📱 WhatsApp Setup\n', colors.green)

  // Check if already authenticated
  const waAuthPath = path.join(__dirname, 'auth_whatsapp')
  if (existsSync(waAuthPath)) {
    print('✅ WhatsApp is already authenticated!\n', colors.green)
    const reauth = await prompt('Re-authenticate (scan new QR)? (y/n): ')
    if (reauth.toLowerCase() === 'y') {
      print('\nRemoving old session...', colors.dim)
      const fs = await import('fs')
      fs.rmSync(waAuthPath, { recursive: true, force: true })
    } else {
      await updateConfig('whatsapp', { enabled: true })
      print('\n✅ WhatsApp enabled!\n', colors.green)
      return
    }
  }

  const enable = await prompt('Enable and authenticate WhatsApp now? (y/n): ')

  if (enable.toLowerCase() !== 'y') {
    await updateConfig('whatsapp', { enabled: false })
    print('\n❌ WhatsApp disabled.\n', colors.dim)
    return
  }

  print('\n🔄 Starting WhatsApp authentication...\n', colors.cyan)
  print('A QR code will appear below. Scan it with:', colors.dim)
  print('  WhatsApp > Settings > Linked Devices > Link a Device\n', colors.dim)

  try {
    // Import and start WhatsApp adapter just for auth
    const { default: WhatsAppAdapter } = await import('./adapters/whatsapp.js')
    const adapter = new WhatsAppAdapter({ enabled: true, allowedDMs: ['*'], allowedGroups: [], respondToMentionsOnly: true })

    // Wait for connection
    await new Promise((resolve, reject) => {
      let connected = false
      let timeout = null

      // Monitor the socket for connection
      const checkConnection = setInterval(() => {
        if (adapter.sock?.user?.id) {
          connected = true
          clearInterval(checkConnection)
          clearTimeout(timeout)
          resolve()
        }
      }, 1000)

      // Start the adapter
      adapter.start().catch(reject)

      // Timeout after 2 minutes
      timeout = setTimeout(() => {
        clearInterval(checkConnection)
        if (!connected) {
          adapter.stop().catch(() => {})
          reject(new Error('Authentication timed out. Please try again.'))
        }
      }, 120000)
    })

    print('\n✅ WhatsApp authenticated successfully!\n', colors.green + colors.bold)

    // Stop the adapter (gateway will start fresh)
    await adapter.stop()

    print('Group Message Settings:\n', colors.cyan)
    print('  1) Respond in all groups (when @mentioned)', colors.green)
    print('  2) DMs only (ignore all groups)', colors.dim)
    print('  3) Specific groups only\n')

    const groupChoice = await prompt('Select group setting (1-3): ')

    let allowedGroups = []
    if (groupChoice.trim() === '1') {
      allowedGroups = ['*']
      print('\n✅ Will respond in all groups when @mentioned\n', colors.green)
    } else if (groupChoice.trim() === '3') {
      print('\nEnter group JIDs (comma-separated). Find these by sending a message in the group.\n', colors.dim)
      const groups = await prompt('Group JIDs: ')
      allowedGroups = groups.split(',').map(g => g.trim()).filter(Boolean)
      print(`\n✅ Will respond in ${allowedGroups.length} specific group(s)\n`, colors.green)
    } else {
      print('\n✅ DMs only - groups disabled\n', colors.dim)
    }

    await updateConfigFull('whatsapp', { enabled: true, allowedGroups })

  } catch (err) {
    print('\n❌ WhatsApp authentication failed: ' + err.message, colors.red)
    print('You can try again or authenticate when starting the gateway.\n', colors.dim)
  }
}

async function setupTelegram() {
  print('\n🤖 Telegram Setup\n', colors.blue)
  print('To create a Telegram bot:')
  print('  1. Open Telegram and message @BotFather')
  print('  2. Send /newbot and follow the prompts')
  print('  3. Copy the bot token\n')

  const enable = await prompt('Enable Telegram adapter? (y/n): ')

  if (enable.toLowerCase() === 'y') {
    const token = await prompt('Enter your bot token: ')

    if (token.trim()) {
      await updateConfig('telegram', { enabled: true, token: token.trim() })
      print('\n✅ Telegram configured!\n', colors.green)
    } else {
      print('\n⚠️  No token provided, Telegram not enabled.\n', colors.yellow)
    }
  } else {
    await updateConfig('telegram', { enabled: false })
    print('\n❌ Telegram disabled.\n', colors.dim)
  }
}

async function setupSignal() {
  print('\n🔒 Signal Setup\n', colors.cyan)
  print('Signal requires signal-cli to be installed and configured.')
  print('Install: https://github.com/AsamK/signal-cli')
  print('')
  print('After installing, register your number:')
  print('  signal-cli -u +1234567890 register')
  print('  signal-cli -u +1234567890 verify CODE\n')

  const enable = await prompt('Enable Signal adapter? (y/n): ')

  if (enable.toLowerCase() === 'y') {
    const phone = await prompt('Enter your Signal phone number (e.g., +1234567890): ')
    const cliPath = await prompt('Path to signal-cli (press Enter for default): ')

    if (phone.trim()) {
      await updateConfig('signal', {
        enabled: true,
        phoneNumber: phone.trim(),
        signalCliPath: cliPath.trim() || 'signal-cli'
      })
      print('\n✅ Signal configured!\n', colors.green)
    } else {
      print('\n⚠️  No phone number provided, Signal not enabled.\n', colors.yellow)
    }
  } else {
    await updateConfig('signal', { enabled: false })
    print('\n❌ Signal disabled.\n', colors.dim)
  }
}

async function setupiMessage() {
  print('\n💬 iMessage Setup\n', colors.yellow)
  print('iMessage adapter works on macOS only.')
  print('It requires the "imsg" CLI tool.')
  print('')
  print('Install from: https://github.com/steipete/imsg')
  print('Or: brew install steipete/formulae/imsg\n')

  const enable = await prompt('Enable iMessage adapter? (y/n): ')

  if (enable.toLowerCase() === 'y') {
    await updateConfig('imessage', { enabled: true })
    print('\n✅ iMessage enabled!\n', colors.green)
  } else {
    await updateConfig('imessage', { enabled: false })
    print('\n❌ iMessage disabled.\n', colors.dim)
  }
}

async function browserSetup() {
  print('\n🌐 Browser Configuration\n', colors.cyan + colors.bold)
  print('━'.repeat(40), colors.dim)
  print('')
  print('Select browser mode:\n')
  print('  1) clawd - Managed browser (isolated profile)', colors.green)
  print('     A dedicated Chromium instance with its own profile')
  print('     Best for: Clean slate, no existing logins\n')
  print('  2) chrome - Control your Chrome (keeps logins)', colors.blue)
  print('     Connect to your existing Chrome browser via CDP')
  print('     Best for: Using existing logged-in sessions\n')
  print('  3) Disable browser', colors.dim)
  print('  4) Back to main menu\n', colors.dim)

  const choice = await prompt('Enter choice (1-4): ')

  switch (choice.trim()) {
    case '1':
      await setupClawdBrowser()
      break
    case '2':
      await setupChromeBrowser()
      break
    case '3':
      await updateBrowserConfig({ enabled: false })
      print('\n❌ Browser disabled.\n', colors.dim)
      await mainMenu()
      return
    case '4':
      await mainMenu()
      return
    default:
      print('\nInvalid choice.\n', colors.red)
      await browserSetup()
      return
  }

  await mainMenu()
}

async function setupClawdBrowser() {
  print('\n🔷 Clawd Browser Setup\n', colors.green)
  print('This launches an isolated Chromium browser with a dedicated profile.')
  print('Your browsing data will be stored separately from your main browser.\n')

  // Check if Playwright browsers are installed by looking for the chromium directory
  print('Checking for Playwright Chromium...', colors.dim)
  const homeDir = process.env.HOME || process.env.USERPROFILE
  const playwrightCacheDir = path.join(homeDir, 'Library', 'Caches', 'ms-playwright')
  const chromiumInstalled = existsSync(playwrightCacheDir) &&
    readdirSync(playwrightCacheDir).some(d => d.startsWith('chromium'))

  if (!chromiumInstalled) {
    print('  ⚠️  Chromium browser not installed\n', colors.yellow)
    const install = await prompt('Install Playwright Chromium now? This is required. (y/n): ')
    if (install.toLowerCase() === 'y') {
      print('\nInstalling Chromium (this may take a minute)...', colors.cyan)
      try {
        execSync('npx playwright install chromium', { stdio: 'inherit' })
        print('\n✅ Chromium installed successfully!\n', colors.green)
      } catch (installErr) {
        print('\n❌ Failed to install Chromium: ' + installErr.message, colors.red)
        print('You can install manually with: npx playwright install chromium\n', colors.yellow)
        return
      }
    } else {
      print('\n⚠️  Browser setup cancelled. Chromium is required for clawd mode.', colors.yellow)
      print('   Install with: npx playwright install chromium\n', colors.cyan)
      return
    }
  } else {
    print('  ✅ Chromium found\n', colors.green)
  }

  const customPath = await prompt('Custom profile path (press Enter for default ~/.clawd-browser-profile): ')
  const headlessChoice = await prompt('Run headless (no visible window)? (y/n, default: n): ')

  const userDataDir = customPath.trim() || '~/.clawd-browser-profile'
  const headless = headlessChoice.toLowerCase() === 'y'

  await updateBrowserConfig({
    enabled: true,
    mode: 'clawd',
    clawd: { userDataDir, headless }
  })

  print('\n✅ Browser configured: clawd mode', colors.green)
  print(`   Profile: ${userDataDir}`, colors.dim)
  print(`   Headless: ${headless}\n`, colors.dim)
}

async function setupChromeBrowser() {
  print('\n🔷 Chrome Browser Setup\n', colors.blue)
  print('This connects to your existing Chrome browser via CDP.')
  print('You\'ll need to start Chrome with remote debugging enabled.\n')

  // Try to find Chrome profiles
  let profiles = []
  try {
    const { findChromeProfiles } = await import('./browser/server.js')
    profiles = findChromeProfiles()
  } catch (err) {
    // Module not available yet, continue without profile detection
  }

  if (profiles.length > 0) {
    print('Found Chrome profiles:\n')
    profiles.forEach((profile, index) => {
      const email = profile.email ? ` (${profile.email})` : ''
      print(`  ${index + 1}) ${profile.name}${email}`, colors.cyan)
    })
    print('')

    const profileChoice = await prompt(`Select profile (1-${profiles.length}), or press Enter to skip: `)
    const profileIndex = parseInt(profileChoice) - 1

    if (profileIndex >= 0 && profileIndex < profiles.length) {
      const selectedProfile = profiles[profileIndex]
      print(`\nSelected: ${selectedProfile.name}`, colors.green)
      print(`Path: ${selectedProfile.path}\n`, colors.dim)
    }
  }

  const cdpPort = await prompt('CDP port (press Enter for default 9222): ')
  const port = parseInt(cdpPort) || 9222

  await updateBrowserConfig({
    enabled: true,
    mode: 'chrome',
    chrome: { cdpPort: port }
  })

  print('\n✅ Browser configured: chrome mode', colors.green)
  print(`   CDP Port: ${port}\n`, colors.dim)
  print('To use this mode, start Chrome with:', colors.yellow)
  print(`   google-chrome --remote-debugging-port=${port}`, colors.cyan)
  print('   or on macOS:', colors.yellow)
  print(`   /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=${port}\n`, colors.cyan)
}

async function updateBrowserConfig(updates) {
  try {
    let content = readFileSync(CONFIG_PATH, 'utf-8')

    // Find the browser config block and replace it
    const browserBlockRegex = /browser:\s*\{[\s\S]*?(?=\n  \w+:|^\})/m

    // Escape single quotes to prevent config injection
    const escapeQuotes = (str) => (str || '').replace(/'/g, "\\'")

    const newBrowserBlock = `browser: {
    enabled: ${updates.enabled},
    mode: '${escapeQuotes(updates.mode) || 'clawd'}',
    clawd: {
      userDataDir: '${escapeQuotes(updates.clawd?.userDataDir) || '~/.clawd-browser-profile'}',
      headless: ${updates.clawd?.headless ?? false}
    },
    chrome: {
      profilePath: '${escapeQuotes(updates.chrome?.profilePath) || ''}',
      cdpPort: ${updates.chrome?.cdpPort || 9222}
    }
  }`

    content = content.replace(browserBlockRegex, newBrowserBlock)
    writeFileSync(CONFIG_PATH, content)
  } catch (err) {
    print('Failed to update browser config: ' + err.message, colors.red)
  }
}

async function updateConfig(platform, updates) {
  try {
    let content = readFileSync(CONFIG_PATH, 'utf-8')

    for (const [key, value] of Object.entries(updates)) {
      const valueStr = typeof value === 'string' ? `'${value}'` : value

      // Find the platform block and update the key
      const platformRegex = new RegExp(`(${platform}:\\s*\\{[^}]*${key}:\\s*)([^,\\n}]+)`, 's')
      if (platformRegex.test(content)) {
        content = content.replace(platformRegex, `$1${valueStr}`)
      }
    }

    writeFileSync(CONFIG_PATH, content)
  } catch (err) {
    print('Failed to update config: ' + err.message, colors.red)
  }
}

async function updateConfigFull(platform, updates) {
  try {
    let content = readFileSync(CONFIG_PATH, 'utf-8')

    for (const [key, value] of Object.entries(updates)) {
      let valueStr
      if (Array.isArray(value)) {
        // Format array properly
        valueStr = JSON.stringify(value).replace(/"/g, "'")
      } else if (typeof value === 'string') {
        valueStr = `'${value}'`
      } else {
        valueStr = value
      }

      // Find the platform block and update the key
      const platformRegex = new RegExp(`(${platform}:\\s*\\{[^}]*${key}:\\s*)(\\[[^\\]]*\\]|[^,\\n}]+)`, 's')
      if (platformRegex.test(content)) {
        content = content.replace(platformRegex, `$1${valueStr}`)
      }
    }

    writeFileSync(CONFIG_PATH, content)
  } catch (err) {
    print('Failed to update config: ' + err.message, colors.red)
  }
}

async function testConnection() {
  print('\n🔍 Testing Connections...\n', colors.cyan)

  // Check WhatsApp auth
  const waAuthPath = path.join(__dirname, 'auth_whatsapp')
  if (existsSync(waAuthPath)) {
    print('  WhatsApp: ✅ Auth folder exists', colors.green)
  } else {
    print('  WhatsApp: ⚠️  Not authenticated yet', colors.yellow)
  }

  // Check Telegram
  try {
    const config = await import('./config.js')
    if (config.default.telegram?.token) {
      print('  Telegram: ✅ Token configured', colors.green)
    } else {
      print('  Telegram: ⚠️  No token configured', colors.yellow)
    }

    if (config.default.signal?.phoneNumber) {
      print('  Signal: ✅ Phone number configured', colors.green)
    } else {
      print('  Signal: ⚠️  No phone number configured', colors.yellow)
    }
  } catch (err) {
    print('  Could not load config: ' + err.message, colors.red)
  }

  console.log('')
  await prompt('Press Enter to continue...')
  await mainMenu()
}

// Parse command line arguments
const args = process.argv.slice(2)

if (args.length === 0) {
  // Interactive mode
  mainMenu().catch(err => {
    console.error('Error:', err)
    process.exit(1)
  })
} else {
  // Command mode
  const command = args[0]

  switch (command) {
    case 'chat':
      terminalChat().catch(err => {
        console.error('Error:', err)
        process.exit(1)
      })
      break

    case 'start':
      print('\n🚀 Starting Clawd Gateway...\n', colors.green)
      import('./gateway.js')
      break

    case 'setup':
      setupWizard().then(() => {
        rl.close()
        process.exit(0)
      })
      break

    case 'config':
      showConfig()
      rl.close()
      break

    case 'help':
    case '--help':
    case '-h':
      printHeader()
      print('Usage: clawd [command]\n', colors.bold)
      print('Commands:')
      print('  chat   Terminal chat with Clawd', colors.red)
      print('  start    Start the gateway')
      print('  setup    Interactive setup wizard')
      print('  config   Show current configuration')
      print('  help     Show this help message')
      print('')
      print('Run without arguments for interactive mode.')
      console.log('')
      rl.close()
      break

    default:
      print(`Unknown command: ${command}`, colors.red)
      print('Run "clawd help" for usage.')
      rl.close()
      process.exit(1)
  }
}
