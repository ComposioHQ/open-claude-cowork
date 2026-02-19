import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import { createExcel, createPowerpoint, createPdf, listGeneratedFiles } from './generators.js'

/**
 * Create an MCP server exposing document generation tools.
 *
 * @param {string} outputDir - Directory to write generated files to
 * @returns {object} SDK MCP server
 */
export function createDocumentMcpServer(outputDir) {
  return createSdkMcpServer({
    name: 'documents',
    version: '1.0.0',
    tools: [
      // ── create_excel ──────────────────────────────────────────
      tool(
        'create_excel',
        'Create an Excel spreadsheet (.xlsx) with one or more sheets, columns, rows, optional formulas, and optional styling.',
        {
          filename: z.string().describe('Output filename (without .xlsx extension)'),
          sheets: z.array(z.object({
            name: z.string().optional().describe('Sheet name (default: Sheet1)'),
            columns: z.array(z.object({
              header: z.string().describe('Column header text'),
              key: z.string().describe('Row property key'),
              width: z.number().optional().describe('Column width (default: 15)')
            })).describe('Column definitions'),
            rows: z.array(z.record(z.any())).describe('Array of row objects with keys matching column keys'),
            styling: z.object({
              headerFill: z.string().optional().describe('Header background color hex (e.g. #4472C4)'),
              headerFont: z.string().optional().describe('Header font color hex (e.g. #FFFFFF)'),
              borders: z.boolean().optional().describe('Add thin borders to all cells')
            }).optional().describe('Optional styling options'),
            formulas: z.array(z.object({
              cell: z.string().describe('Cell reference (e.g. D11)'),
              formula: z.string().describe('Excel formula (e.g. SUM(D2:D10))')
            })).optional().describe('Optional formulas to add after rows')
          })).describe('Array of sheet definitions')
        },
        async (args) => {
          try {
            const result = await createExcel({
              filename: args.filename,
              outputDir,
              sheets: args.sheets
            })
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  filePath: result.filePath,
                  fileSize: result.fileSize,
                  message: `Excel file created: ${result.filePath} (${formatBytes(result.fileSize)})`
                }, null, 2)
              }]
            }
          } catch (err) {
            return {
              content: [{ type: 'text', text: JSON.stringify({ success: false, error: err.message }) }]
            }
          }
        }
      ),

      // ── create_powerpoint ─────────────────────────────────────
      tool(
        'create_powerpoint',
        'Create a PowerPoint presentation (.pptx) with slides. Supported layouts: title, content, two-column, image, blank.',
        {
          filename: z.string().describe('Output filename (without .pptx extension)'),
          title: z.string().optional().describe('Presentation title (used on metadata)'),
          author: z.string().optional().describe('Author name'),
          slides: z.array(z.object({
            layout: z.enum(['title', 'content', 'two-column', 'image', 'blank']).optional()
              .describe('Slide layout type (default: content)'),
            title: z.string().optional().describe('Slide title'),
            body: z.string().optional().describe('Main body text (for title/content layouts)'),
            left: z.string().optional().describe('Left column text (two-column layout)'),
            right: z.string().optional().describe('Right column text (two-column layout)'),
            imagePath: z.string().optional().describe('Local path to image file (image layout)'),
            imageUrl: z.string().optional().describe('URL reference for image placeholder (image layout)'),
            notes: z.string().optional().describe('Speaker notes for this slide')
          })).describe('Array of slide definitions')
        },
        async (args) => {
          try {
            const result = await createPowerpoint({
              filename: args.filename,
              outputDir,
              title: args.title,
              author: args.author,
              slides: args.slides
            })
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  filePath: result.filePath,
                  fileSize: result.fileSize,
                  message: `PowerPoint file created: ${result.filePath} (${formatBytes(result.fileSize)})`
                }, null, 2)
              }]
            }
          } catch (err) {
            return {
              content: [{ type: 'text', text: JSON.stringify({ success: false, error: err.message }) }]
            }
          }
        }
      ),

      // ── create_pdf ────────────────────────────────────────────
      tool(
        'create_pdf',
        'Create a PDF document with headings, paragraphs, lists, tables, and page breaks.',
        {
          filename: z.string().describe('Output filename (without .pdf extension)'),
          title: z.string().optional().describe('Document title'),
          author: z.string().optional().describe('Author name'),
          content: z.array(z.object({
            type: z.enum(['heading', 'paragraph', 'list', 'table', 'page_break'])
              .describe('Content block type'),
            text: z.string().optional().describe('Text content (heading/paragraph)'),
            level: z.number().optional().describe('Heading level 1-3 (default: 1)'),
            items: z.array(z.string()).optional().describe('List items (for list type)'),
            headers: z.array(z.string()).optional().describe('Table column headers (for table type)'),
            rows: z.array(z.array(z.string())).optional().describe('Table rows as arrays of cell values (for table type)')
          })).describe('Array of content blocks'),
          pageOptions: z.object({
            size: z.string().optional().describe('Page size: A4, Letter, Legal (default: A4)'),
            margins: z.object({
              top: z.number().optional(),
              bottom: z.number().optional(),
              left: z.number().optional(),
              right: z.number().optional()
            }).optional().describe('Page margins in points')
          }).optional().describe('Page layout options')
        },
        async (args) => {
          try {
            const result = await createPdf({
              filename: args.filename,
              outputDir,
              title: args.title,
              author: args.author,
              content: args.content,
              pageOptions: args.pageOptions
            })
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  filePath: result.filePath,
                  fileSize: result.fileSize,
                  message: `PDF file created: ${result.filePath} (${formatBytes(result.fileSize)})`
                }, null, 2)
              }]
            }
          } catch (err) {
            return {
              content: [{ type: 'text', text: JSON.stringify({ success: false, error: err.message }) }]
            }
          }
        }
      ),

      // ── list_generated_files ──────────────────────────────────
      tool(
        'list_generated_files',
        'List all generated document files (Excel, PowerPoint, PDF) in the output directory.',
        {},
        async () => {
          try {
            const files = listGeneratedFiles(outputDir)
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  outputDirectory: outputDir,
                  files,
                  count: files.length
                }, null, 2)
              }]
            }
          } catch (err) {
            return {
              content: [{ type: 'text', text: JSON.stringify({ success: false, error: err.message }) }]
            }
          }
        }
      )
    ]
  })
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}
