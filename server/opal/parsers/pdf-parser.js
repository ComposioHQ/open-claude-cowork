import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');

/**
 * Parse a PDF file and extract text content.
 *
 * @param {Buffer} buffer - The PDF file buffer
 * @returns {Promise<string>} Extracted text content
 */
export async function parsePdf(buffer) {
  const data = await pdf(buffer);
  return data.text;
}
