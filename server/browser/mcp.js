import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'

/**
 * Create an MCP server that wraps BrowserServer
 * Uses createSdkMcpServer for proper SDK compatibility
 */
export function createBrowserMcpServer(browserServer) {
  let browserStarted = false
  let browserStarting = null

  // Lazy start the browser on first tool call
  const ensureBrowserStarted = async () => {
    if (browserStarted) return
    if (browserStarting) {
      await browserStarting
      return
    }
    console.log('[BrowserMCP] Starting browser on first tool call...')
    browserStarting = browserServer.start()
    await browserStarting
    browserStarted = true
    browserStarting = null
  }

  return createSdkMcpServer({
    name: 'browser',
    version: '1.0.0',
    tools: [
      tool(
        'browser_status',
        'Get the current browser status (running, mode, current URL, tab count)',
        {},
        async () => {
          const status = browserServer.getStatus()
          status.lazyInit = !browserStarted
          return {
            content: [{ type: 'text', text: JSON.stringify(status, null, 2) }]
          }
        }
      ),

      tool(
        'browser_navigate',
        'Navigate to a URL in the browser',
        {
          url: z.string().describe('The URL to navigate to')
        },
        async (args) => {
          await ensureBrowserStarted()
          const result = await browserServer.navigate(args.url)
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
          }
        }
      ),

      tool(
        'browser_snapshot',
        'Get an accessibility tree snapshot of the current page. Returns elements with [ref=eN] identifiers that can be used with click/type actions.',
        {
          format: z.enum(['tree', 'text']).optional().describe('Output format: "tree" for structured JSON, "text" for compact text representation')
        },
        async (args) => {
          await ensureBrowserStarted()
          const result = args.format === 'text'
            ? await browserServer.textSnapshot()
            : await browserServer.snapshot()
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
          }
        }
      ),

      tool(
        'browser_screenshot',
        'Take a screenshot of the current page',
        {
          fullPage: z.boolean().optional().describe('Whether to capture the full scrollable page')
        },
        async (args) => {
          await ensureBrowserStarted()
          const screenshot = await browserServer.screenshot({ fullPage: args.fullPage })
          return {
            content: [{
              type: 'image',
              data: screenshot.data,
              mimeType: screenshot.mimeType
            }]
          }
        }
      ),

      tool(
        'browser_click',
        'Click an element on the page. Use element ref (e.g., "e5") from snapshot, or descriptive text (e.g., "Submit button")',
        {
          target: z.string().describe('Element ref (e.g., "e5") or descriptive text to click')
        },
        async (args) => {
          await ensureBrowserStarted()
          const result = await browserServer.click(args.target)
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
          }
        }
      ),

      tool(
        'browser_type',
        'Type text into an input field. Use element ref or field name/placeholder.',
        {
          target: z.string().describe('Element ref (e.g., "e5") or input field identifier'),
          text: z.string().describe('Text to type'),
          clear: z.boolean().optional().describe('Whether to clear the field first (default: false)')
        },
        async (args) => {
          await ensureBrowserStarted()
          const result = await browserServer.type(args.target, args.text, { clear: args.clear })
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
          }
        }
      ),

      tool(
        'browser_press',
        'Press a keyboard key (e.g., "Enter", "Tab", "Escape", "ArrowDown")',
        {
          key: z.string().describe('Key to press')
        },
        async (args) => {
          await ensureBrowserStarted()
          const result = await browserServer.press(args.key)
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
          }
        }
      ),

      tool(
        'browser_select',
        'Select an option from a dropdown/select element',
        {
          target: z.string().describe('Element ref or dropdown identifier'),
          value: z.string().describe('Option value or text to select')
        },
        async (args) => {
          await ensureBrowserStarted()
          const result = await browserServer.select(args.target, args.value)
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
          }
        }
      ),

      tool(
        'browser_wait',
        'Wait for an element or text to appear on the page',
        {
          target: z.string().describe('Element selector or text to wait for'),
          type: z.enum(['selector', 'text']).optional().describe('Wait type: "selector" for CSS selector, "text" for visible text'),
          timeout: z.number().optional().describe('Maximum wait time in milliseconds (default: 10000)')
        },
        async (args) => {
          await ensureBrowserStarted()
          const result = await browserServer.waitFor(args.target, {
            type: args.type,
            timeout: args.timeout
          })
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
          }
        }
      ),

      tool(
        'browser_tabs',
        'List all open browser tabs',
        {},
        async () => {
          await ensureBrowserStarted()
          const result = await browserServer.getTabs()
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
          }
        }
      ),

      tool(
        'browser_switch_tab',
        'Switch to a different browser tab by index',
        {
          index: z.number().describe('Tab index (0-based)')
        },
        async (args) => {
          await ensureBrowserStarted()
          const result = await browserServer.switchTab(args.index)
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
          }
        }
      ),

      tool(
        'browser_new_tab',
        'Open a new browser tab, optionally navigating to a URL',
        {
          url: z.string().optional().describe('Optional URL to open in the new tab')
        },
        async (args) => {
          await ensureBrowserStarted()
          const result = await browserServer.newTab(args.url)
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
          }
        }
      ),

      tool(
        'browser_close_tab',
        'Close the current browser tab',
        {},
        async () => {
          await ensureBrowserStarted()
          const result = await browserServer.closeTab()
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
          }
        }
      ),

      tool(
        'browser_back',
        'Go back in browser history',
        {},
        async () => {
          await ensureBrowserStarted()
          const result = await browserServer.goBack()
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
          }
        }
      ),

      tool(
        'browser_forward',
        'Go forward in browser history',
        {},
        async () => {
          await ensureBrowserStarted()
          const result = await browserServer.goForward()
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
          }
        }
      ),

      tool(
        'browser_reload',
        'Reload the current page',
        {},
        async () => {
          await ensureBrowserStarted()
          const result = await browserServer.reload()
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
          }
        }
      )
    ]
  })
}

export default createBrowserMcpServer
