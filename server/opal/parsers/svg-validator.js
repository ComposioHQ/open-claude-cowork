/**
 * SVG Validator - Programmatic structural validation for logo SVGs.
 *
 * Checks basic structural requirements without needing an LLM.
 * The Craft Critic agent provides deeper quality assessment.
 */

/**
 * Validate an SVG string against structural requirements.
 *
 * @param {string} svgCode - The SVG markup string
 * @returns {{ valid: boolean, errors: string[], warnings: string[], stats: Object }}
 */
export function validateSvg(svgCode) {
  const errors = [];
  const warnings = [];
  const stats = {};

  if (!svgCode || typeof svgCode !== 'string') {
    return { valid: false, errors: ['No SVG code provided'], warnings, stats };
  }

  // 1. Basic SVG structure
  if (!svgCode.includes('<svg')) {
    errors.push('Missing <svg> element');
  }
  if (!svgCode.includes('xmlns')) {
    warnings.push('Missing xmlns attribute');
  }

  // 2. viewBox check
  const viewBoxMatch = svgCode.match(/viewBox=["']([^"']+)["']/);
  if (!viewBoxMatch) {
    errors.push('Missing viewBox attribute');
  } else {
    stats.viewBox = viewBoxMatch[1];
    const parts = viewBoxMatch[1].trim().split(/\s+/);
    if (parts.length !== 4) {
      errors.push('viewBox must have exactly 4 values');
    }
  }

  // 3. No external references
  if (svgCode.includes('xlink:href="http') || svgCode.includes('href="http')) {
    errors.push('Contains external URL references');
  }
  if (/<image\b/.test(svgCode)) {
    errors.push('Contains <image> element (raster data not allowed)');
  }
  if (svgCode.includes('data:image')) {
    errors.push('Contains embedded raster data (data:image)');
  }

  // 4. No text elements (logomarks should be pure geometry)
  if (/<text\b/.test(svgCode)) {
    warnings.push('Contains <text> element - logomarks should be pure geometry');
  }

  // 5. Element count
  const pathCount = (svgCode.match(/<path\b/g) || []).length;
  const circleCount = (svgCode.match(/<circle\b/g) || []).length;
  const rectCount = (svgCode.match(/<rect\b/g) || []).length;
  const polygonCount = (svgCode.match(/<polygon\b/g) || []).length;
  const ellipseCount = (svgCode.match(/<ellipse\b/g) || []).length;
  const lineCount = (svgCode.match(/<line\b/g) || []).length;

  const totalElements = pathCount + circleCount + rectCount + polygonCount + ellipseCount + lineCount;
  stats.elements = { path: pathCount, circle: circleCount, rect: rectCount, polygon: polygonCount, ellipse: ellipseCount, line: lineCount };
  stats.totalElements = totalElements;

  if (totalElements === 0) {
    errors.push('No geometric elements found');
  }
  if (totalElements > 20) {
    warnings.push(`High element count (${totalElements}) - consider simplifying`);
  }

  // 6. File size check (SVG should be compact)
  stats.byteSize = new TextEncoder().encode(svgCode).length;
  if (stats.byteSize > 50000) {
    warnings.push(`Large SVG (${Math.round(stats.byteSize / 1024)}KB) - consider optimizing`);
  }

  // 7. Check for inline styles (prefer attributes)
  if (svgCode.includes('style="')) {
    warnings.push('Contains inline styles - prefer fill/stroke attributes');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats,
  };
}

/**
 * Extract SVG code from a text response that may contain markdown code blocks.
 *
 * @param {string} text - Full text response that may contain ```svg blocks
 * @returns {string[]} Array of extracted SVG strings
 */
export function extractSvgFromText(text) {
  const svgs = [];

  // Match ```svg code blocks
  const codeBlockRegex = /```svg\n([\s\S]*?)```/g;
  let match;
  while ((match = codeBlockRegex.exec(text)) !== null) {
    svgs.push(match[1].trim());
  }

  // Also try matching raw <svg> elements if no code blocks found
  if (svgs.length === 0) {
    const svgRegex = /<svg[\s\S]*?<\/svg>/g;
    while ((match = svgRegex.exec(text)) !== null) {
      svgs.push(match[0].trim());
    }
  }

  return svgs;
}
