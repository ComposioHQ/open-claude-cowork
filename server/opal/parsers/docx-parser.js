import mammoth from 'mammoth';

/**
 * Parse a DOCX file and extract text content.
 *
 * @param {Buffer} buffer - The DOCX file buffer
 * @returns {Promise<string>} Extracted text content
 */
export async function parseDocx(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}
