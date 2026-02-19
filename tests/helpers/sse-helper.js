/**
 * Parse SSE response text into an array of parsed chunks.
 * Handles `data: {...}` lines and skips heartbeat comments.
 */
export function parseSSEText(text) {
  const chunks = [];
  const lines = text.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and heartbeat comments
    if (!trimmed || trimmed.startsWith(':')) continue;

    // Parse data: lines
    if (trimmed.startsWith('data: ')) {
      try {
        const json = JSON.parse(trimmed.slice(6));
        chunks.push(json);
      } catch {
        // Skip non-JSON data lines
      }
    }
  }

  return chunks;
}

/**
 * Collect SSE chunks from a supertest response body string.
 */
export function collectSSEChunks(responseText) {
  return parseSSEText(responseText);
}
