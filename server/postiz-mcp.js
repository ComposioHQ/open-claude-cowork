#!/usr/bin/env node
/**
 * Local stdio MCP server for the Postiz social-media scheduling API.
 *
 * Wraps the Postiz public REST API (v1) and exposes 9 tools:
 *   - postiz_list_integrations
 *   - postiz_check_auth
 *   - postiz_find_slot
 *   - postiz_create_post
 *   - postiz_list_posts
 *   - postiz_delete_post
 *   - postiz_upload_from_url
 *   - postiz_get_platform_analytics
 *   - postiz_get_post_analytics
 *
 * Rate limit: 30 requests / hour on the Postiz cloud plan.
 *
 * Env vars:
 *   POSTIZ_API_KEY   — required
 *   POSTIZ_BASE_URL  — optional, defaults to Postiz cloud
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Postiz API client
// ---------------------------------------------------------------------------

const API_BASE = process.env.POSTIZ_BASE_URL?.replace(/\/+$/, '') || 'https://app.postiz.com/api/public/v1';

function getAuthHeader() {
  return process.env.POSTIZ_API_KEY || '';
}

async function apiRequest(method, endpoint, body) {
  const url = `${API_BASE}${endpoint}`;
  const headers = {
    Authorization: getAuthHeader(),
    'Content-Type': 'application/json'
  };
  const opts = { method, headers };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Postiz ${method} ${endpoint} ${res.status}: ${text}`);
  }
  // Some endpoints (DELETE) may return empty body
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return res.json();
  }
  return { status: res.status, statusText: res.statusText };
}

function jsonResult(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'postiz',
  version: '1.0.0'
});

// ---- 1. List integrations -------------------------------------------------

server.tool(
  'postiz_list_integrations',
  'List connected social media channels in Postiz. Rate limited to 30 req/hour.',
  {},
  async () => {
    const result = await apiRequest('GET', '/integrations');
    return jsonResult(result);
  }
);

// ---- 2. Check auth --------------------------------------------------------

server.tool(
  'postiz_check_auth',
  'Verify the Postiz API key is valid and the account is accessible. Rate limited to 30 req/hour.',
  {},
  async () => {
    const result = await apiRequest('POST', '/integrations/check');
    return jsonResult(result);
  }
);

// ---- 3. Find slot ---------------------------------------------------------

server.tool(
  'postiz_find_slot',
  'Find the next available posting time for a given integration. Rate limited to 30 req/hour.',
  {
    id: z.string().describe('Integration ID to find the next available slot for')
  },
  async ({ id }) => {
    const result = await apiRequest('GET', `/integrations/find-slot?id=${encodeURIComponent(id)}`);
    return jsonResult(result);
  }
);

// ---- 4. Create post -------------------------------------------------------

server.tool(
  'postiz_create_post',
  'Create or schedule a social media post in Postiz. Rate limited to 30 req/hour.',
  {
    content: z.string().describe('The text content of the post'),
    integration_ids: z.array(z.string()).describe('Array of integration IDs to post to'),
    date: z.string().optional().describe('ISO 8601 date string for scheduling (omit for immediate)'),
    media: z.array(z.object({
      url: z.string().describe('Media URL'),
      type: z.enum(['image', 'video']).optional().describe('Media type')
    })).optional().describe('Array of media attachments')
  },
  async ({ content, integration_ids, date, media }) => {
    const body = {
      content,
      integration_ids,
      ...(date && { date }),
      ...(media && { media })
    };
    const result = await apiRequest('POST', '/posts', body);
    return jsonResult(result);
  }
);

// ---- 5. List posts --------------------------------------------------------

server.tool(
  'postiz_list_posts',
  'List posts in Postiz within a date range. Rate limited to 30 req/hour.',
  {
    from: z.string().describe('Start date (ISO 8601)'),
    to: z.string().describe('End date (ISO 8601)')
  },
  async ({ from, to }) => {
    const params = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    const result = await apiRequest('GET', `/posts?${params}`);
    return jsonResult(result);
  }
);

// ---- 6. Delete post -------------------------------------------------------

server.tool(
  'postiz_delete_post',
  'Delete a post by ID in Postiz. Rate limited to 30 req/hour.',
  {
    id: z.string().describe('Post ID to delete')
  },
  async ({ id }) => {
    const result = await apiRequest('DELETE', `/posts/${encodeURIComponent(id)}`);
    return jsonResult(result);
  }
);

// ---- 7. Upload from URL ---------------------------------------------------

server.tool(
  'postiz_upload_from_url',
  'Upload media from a URL to Postiz for use in posts. Rate limited to 30 req/hour.',
  {
    url: z.string().describe('Public URL of the media file to upload')
  },
  async ({ url }) => {
    const result = await apiRequest('POST', '/uploads/url', { url });
    return jsonResult(result);
  }
);

// ---- 8. Platform analytics ------------------------------------------------

server.tool(
  'postiz_get_platform_analytics',
  'Get analytics for a connected social media channel. Rate limited to 30 req/hour.',
  {
    id: z.string().describe('Integration ID'),
    days: z.number().optional().describe('Number of days to look back (default varies by platform)')
  },
  async ({ id, days }) => {
    let qs = `id=${encodeURIComponent(id)}`;
    if (days !== undefined) qs += `&days=${days}`;
    const result = await apiRequest('GET', `/analytics/platform?${qs}`);
    return jsonResult(result);
  }
);

// ---- 9. Post analytics ----------------------------------------------------

server.tool(
  'postiz_get_post_analytics',
  'Get analytics for a specific published post. Rate limited to 30 req/hour.',
  {
    id: z.string().describe('Post ID')
  },
  async ({ id }) => {
    const result = await apiRequest('GET', `/analytics/post?id=${encodeURIComponent(id)}`);
    return jsonResult(result);
  }
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);
