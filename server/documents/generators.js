import ExcelJS from 'exceljs'
import PptxGenJS from 'pptxgenjs'
import PDFDocument from 'pdfkit'
import fs from 'fs'
import path from 'path'

/**
 * Ensure the output directory exists.
 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

/**
 * Create an Excel workbook.
 *
 * @param {object} opts
 * @param {string} opts.filename - Output filename (without extension)
 * @param {string} opts.outputDir - Directory to write to
 * @param {Array<object>} opts.sheets - Array of sheet definitions:
 *   { name: string, columns: Array<{header,key,width?}>, rows: Array<object>, styling?: object }
 * @returns {Promise<{filePath: string, fileSize: number}>}
 */
export async function createExcel({ filename, outputDir, sheets }) {
  ensureDir(outputDir)
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Open Claude Cowork'
  workbook.created = new Date()

  for (const sheet of sheets) {
    const ws = workbook.addWorksheet(sheet.name || 'Sheet1')

    if (sheet.columns) {
      ws.columns = sheet.columns.map(col => ({
        header: col.header,
        key: col.key,
        width: col.width || 15
      }))
    }

    if (sheet.rows) {
      for (const row of sheet.rows) {
        ws.addRow(row)
      }
    }

    // Apply optional styling
    if (sheet.styling) {
      const s = sheet.styling
      // Header row styling
      if (s.headerFill || s.headerFont) {
        const headerRow = ws.getRow(1)
        headerRow.eachCell(cell => {
          if (s.headerFill) {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: s.headerFill.replace('#', 'FF') }
            }
          }
          if (s.headerFont) {
            cell.font = { bold: true, color: { argb: (s.headerFont || '#000000').replace('#', 'FF') } }
          }
        })
      }
      // Borders
      if (s.borders) {
        ws.eachRow(row => {
          row.eachCell(cell => {
            cell.border = {
              top: { style: 'thin' },
              left: { style: 'thin' },
              bottom: { style: 'thin' },
              right: { style: 'thin' }
            }
          })
        })
      }
    }

    // Apply formulas if provided
    if (sheet.formulas) {
      for (const f of sheet.formulas) {
        ws.getCell(f.cell).value = { formula: f.formula }
      }
    }
  }

  const safeName = filename.replace(/[^a-zA-Z0-9_-]/g, '_')
  const filePath = path.join(outputDir, `${safeName}.xlsx`)
  await workbook.xlsx.writeFile(filePath)
  const stats = fs.statSync(filePath)
  return { filePath, fileSize: stats.size }
}

/**
 * Create a PowerPoint presentation.
 *
 * @param {object} opts
 * @param {string} opts.filename - Output filename (without extension)
 * @param {string} opts.outputDir - Directory to write to
 * @param {string} [opts.title] - Presentation title (used for title slide)
 * @param {string} [opts.author] - Author name
 * @param {Array<object>} opts.slides - Array of slide definitions:
 *   { layout: 'title'|'content'|'two-column'|'image'|'blank', title?, body?, left?, right?, imagePath?, imageUrl?, notes? }
 * @returns {Promise<{filePath: string, fileSize: number}>}
 */
export async function createPowerpoint({ filename, outputDir, title, author, slides }) {
  ensureDir(outputDir)
  const pptx = new PptxGenJS()
  pptx.author = author || 'Open Claude Cowork'
  pptx.title = title || filename

  for (const slideDef of slides) {
    const slide = pptx.addSlide()
    const layout = slideDef.layout || 'content'

    switch (layout) {
      case 'title':
        slide.addText(slideDef.title || '', {
          x: 0.5, y: 1.5, w: 9, h: 1.5,
          fontSize: 36, bold: true, align: 'center', color: '333333'
        })
        if (slideDef.body) {
          slide.addText(slideDef.body, {
            x: 0.5, y: 3.5, w: 9, h: 1,
            fontSize: 18, align: 'center', color: '666666'
          })
        }
        break

      case 'two-column':
        if (slideDef.title) {
          slide.addText(slideDef.title, {
            x: 0.5, y: 0.3, w: 9, h: 0.8,
            fontSize: 24, bold: true, color: '333333'
          })
        }
        if (slideDef.left) {
          slide.addText(slideDef.left, {
            x: 0.5, y: 1.3, w: 4.2, h: 4,
            fontSize: 14, color: '444444', valign: 'top'
          })
        }
        if (slideDef.right) {
          slide.addText(slideDef.right, {
            x: 5.3, y: 1.3, w: 4.2, h: 4,
            fontSize: 14, color: '444444', valign: 'top'
          })
        }
        break

      case 'image':
        if (slideDef.title) {
          slide.addText(slideDef.title, {
            x: 0.5, y: 0.3, w: 9, h: 0.8,
            fontSize: 24, bold: true, color: '333333'
          })
        }
        if (slideDef.imagePath && fs.existsSync(slideDef.imagePath)) {
          slide.addImage({ path: slideDef.imagePath, x: 1, y: 1.5, w: 8, h: 4 })
        } else if (slideDef.imageUrl) {
          slide.addText(`[Image: ${slideDef.imageUrl}]`, {
            x: 1, y: 2.5, w: 8, h: 1,
            fontSize: 12, color: '999999', align: 'center'
          })
        }
        break

      case 'blank':
        // Empty slide
        break

      default: // 'content'
        if (slideDef.title) {
          slide.addText(slideDef.title, {
            x: 0.5, y: 0.3, w: 9, h: 0.8,
            fontSize: 24, bold: true, color: '333333'
          })
        }
        if (slideDef.body) {
          slide.addText(slideDef.body, {
            x: 0.5, y: 1.3, w: 9, h: 4,
            fontSize: 14, color: '444444', valign: 'top'
          })
        }
        break
    }

    if (slideDef.notes) {
      slide.addNotes(slideDef.notes)
    }
  }

  const safeName = filename.replace(/[^a-zA-Z0-9_-]/g, '_')
  const filePath = path.join(outputDir, `${safeName}.pptx`)
  await pptx.writeFile({ fileName: filePath })
  const stats = fs.statSync(filePath)
  return { filePath, fileSize: stats.size }
}

/**
 * Create a PDF document.
 *
 * @param {object} opts
 * @param {string} opts.filename - Output filename (without extension)
 * @param {string} opts.outputDir - Directory to write to
 * @param {string} [opts.title] - Document title
 * @param {string} [opts.author] - Author name
 * @param {Array<object>} opts.content - Array of content blocks:
 *   { type: 'heading'|'paragraph'|'list'|'table'|'page_break', text?, level?, items?, headers?, rows? }
 * @param {object} [opts.pageOptions] - Page size, margins, etc.
 * @returns {Promise<{filePath: string, fileSize: number}>}
 */
export async function createPdf({ filename, outputDir, title, author, content, pageOptions }) {
  ensureDir(outputDir)

  const safeName = filename.replace(/[^a-zA-Z0-9_-]/g, '_')
  const filePath = path.join(outputDir, `${safeName}.pdf`)

  return new Promise((resolve, reject) => {
    const docOpts = {
      size: pageOptions?.size || 'A4',
      margins: pageOptions?.margins || { top: 50, bottom: 50, left: 50, right: 50 },
      info: {
        Title: title || filename,
        Author: author || 'Open Claude Cowork'
      }
    }

    const doc = new PDFDocument(docOpts)
    const stream = fs.createWriteStream(filePath)
    doc.pipe(stream)

    for (const block of content) {
      switch (block.type) {
        case 'heading': {
          const level = block.level || 1
          const sizes = { 1: 28, 2: 22, 3: 18 }
          const fontSize = sizes[level] || 16
          doc.fontSize(fontSize).font('Helvetica-Bold')
          doc.text(block.text || '', { paragraphGap: 8 })
          doc.moveDown(0.3)
          break
        }

        case 'paragraph':
          doc.fontSize(12).font('Helvetica')
          doc.text(block.text || '', { paragraphGap: 6, lineGap: 3 })
          doc.moveDown(0.5)
          break

        case 'list':
          doc.fontSize(12).font('Helvetica')
          if (block.items) {
            for (const item of block.items) {
              doc.text(`  \u2022  ${item}`, { indent: 15, paragraphGap: 3 })
            }
          }
          doc.moveDown(0.5)
          break

        case 'table':
          if (block.headers && block.rows) {
            const colCount = block.headers.length
            const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right
            const colWidth = pageWidth / colCount
            const startX = doc.page.margins.left
            let y = doc.y

            // Headers
            doc.fontSize(11).font('Helvetica-Bold')
            for (let i = 0; i < colCount; i++) {
              doc.text(block.headers[i], startX + i * colWidth, y, {
                width: colWidth, continued: false
              })
            }
            y = doc.y + 5
            doc.moveTo(startX, y).lineTo(startX + pageWidth, y).stroke()
            y += 5

            // Rows
            doc.font('Helvetica').fontSize(10)
            for (const row of block.rows) {
              const vals = Array.isArray(row) ? row : Object.values(row)
              const rowY = y
              for (let i = 0; i < colCount; i++) {
                doc.text(String(vals[i] ?? ''), startX + i * colWidth, rowY, {
                  width: colWidth, continued: false
                })
              }
              y = doc.y + 3
            }
            doc.moveDown(1)
          }
          break

        case 'page_break':
          doc.addPage()
          break

        default:
          if (block.text) {
            doc.fontSize(12).font('Helvetica')
            doc.text(block.text)
            doc.moveDown(0.5)
          }
          break
      }
    }

    doc.end()
    stream.on('finish', () => {
      const stats = fs.statSync(filePath)
      resolve({ filePath, fileSize: stats.size })
    })
    stream.on('error', reject)
  })
}

/**
 * List files in the output directory.
 *
 * @param {string} outputDir
 * @returns {Array<{name: string, size: number, modified: string, type: string}>}
 */
export function listGeneratedFiles(outputDir) {
  if (!fs.existsSync(outputDir)) return []

  const files = fs.readdirSync(outputDir)
  return files.map(name => {
    const fullPath = path.join(outputDir, name)
    const stats = fs.statSync(fullPath)
    const ext = path.extname(name).toLowerCase()
    const typeMap = { '.xlsx': 'excel', '.pptx': 'powerpoint', '.pdf': 'pdf' }
    return {
      name,
      size: stats.size,
      modified: stats.mtime.toISOString(),
      type: typeMap[ext] || 'unknown'
    }
  }).filter(f => ['.xlsx', '.pptx', '.pdf'].includes(path.extname(f.name).toLowerCase()))
}
