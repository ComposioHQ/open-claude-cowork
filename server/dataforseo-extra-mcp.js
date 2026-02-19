#!/usr/bin/env node
/**
 * Custom MCP server for DataForSEO API categories NOT covered by the official
 * dataforseo-mcp-server: Merchant, App Data, Reviews, Social Media.
 *
 * Runs as a local stdio MCP server and uses the same DATAFORSEO_USERNAME /
 * DATAFORSEO_PASSWORD env vars for HTTP Basic Auth.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// DataForSEO API client
// ---------------------------------------------------------------------------

const API_BASE = 'https://api.dataforseo.com';

function getAuthHeader() {
  const u = process.env.DATAFORSEO_USERNAME || '';
  const p = process.env.DATAFORSEO_PASSWORD || '';
  return 'Basic ' + Buffer.from(`${u}:${p}`).toString('base64');
}

async function apiPost(endpoint, payload) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: getAuthHeader(),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`DataForSEO ${endpoint} ${res.status}: ${body}`);
  }
  return res.json();
}

async function apiGet(endpoint) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: { Authorization: getAuthHeader() }
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`DataForSEO ${endpoint} ${res.status}: ${body}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Task-based polling helper  (POST task → poll tasks_ready → GET results)
// ---------------------------------------------------------------------------

async function postAndPoll(taskPostEndpoint, taskGetPrefix, payload, timeoutMs = 30000) {
  const postRes = await apiPost(taskPostEndpoint, Array.isArray(payload) ? payload : [payload]);

  const tasks = postRes?.tasks;
  if (!tasks?.length || !tasks[0]?.id) {
    return postRes; // immediate result or error
  }

  const taskId = tasks[0].id;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 2000));
    try {
      const ready = await apiGet(`${taskGetPrefix}/tasks_ready`);
      const readyTask = ready?.tasks?.find(t => t?.result?.[0]?.id === taskId);
      if (readyTask) {
        const resultEndpoint = readyTask.result[0].endpoint;
        return apiGet(resultEndpoint);
      }
    } catch {
      // keep polling
    }
  }

  throw new Error(`Task ${taskId} did not complete within ${timeoutMs / 1000}s`);
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'dataforseo-extra',
  version: '1.0.0'
});

// ---- 1. Merchant: Google Shopping ----------------------------------------

server.tool(
  'merchant_google_shopping_search',
  'Search Google Shopping products via DataForSEO Merchant API',
  {
    keyword: z.string().describe('Search keyword'),
    location_name: z.string().optional().describe('Location name, e.g. "United States"'),
    language_name: z.string().optional().describe('Language, e.g. "English"'),
    depth: z.number().optional().describe('Number of results (default 10)')
  },
  async ({ keyword, location_name, language_name, depth }) => {
    const task = {
      keyword,
      ...(location_name && { location_name }),
      ...(language_name && { language_name }),
      ...(depth && { depth })
    };
    const result = await postAndPoll(
      '/v3/merchant/google/products/task_post',
      '/v3/merchant/google/products',
      task
    );
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

// ---- 2. Merchant: Amazon -------------------------------------------------

server.tool(
  'merchant_amazon_search',
  'Search Amazon products via DataForSEO Merchant API',
  {
    keyword: z.string().describe('Search keyword'),
    location_name: z.string().optional().describe('Location name'),
    language_name: z.string().optional().describe('Language'),
    depth: z.number().optional().describe('Number of results')
  },
  async ({ keyword, location_name, language_name, depth }) => {
    const task = {
      keyword,
      ...(location_name && { location_name }),
      ...(language_name && { language_name }),
      ...(depth && { depth })
    };
    const result = await postAndPoll(
      '/v3/merchant/amazon/products/task_post',
      '/v3/merchant/amazon/products',
      task
    );
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

// ---- 3. App Data: Google Play --------------------------------------------

server.tool(
  'app_data_google_play',
  'Search Google Play apps, rankings, or reviews via DataForSEO App Data API',
  {
    keyword: z.string().optional().describe('Search keyword (for search/rankings)'),
    app_id: z.string().optional().describe('App ID (for reviews)'),
    type: z.enum(['search', 'rankings', 'reviews']).describe('Query type'),
    location_name: z.string().optional().describe('Location name'),
    language_name: z.string().optional().describe('Language'),
    depth: z.number().optional().describe('Number of results')
  },
  async ({ keyword, app_id, type, location_name, language_name, depth }) => {
    const typeMap = {
      search: { post: '/v3/app_data/google/app_searches/task_post', prefix: '/v3/app_data/google/app_searches' },
      rankings: { post: '/v3/app_data/google/app_list/task_post', prefix: '/v3/app_data/google/app_list' },
      reviews: { post: '/v3/app_data/google/app_reviews/task_post', prefix: '/v3/app_data/google/app_reviews' }
    };
    const ep = typeMap[type];
    const task = {
      ...(keyword && { keyword }),
      ...(app_id && { app_id }),
      ...(location_name && { location_name }),
      ...(language_name && { language_name }),
      ...(depth && { depth })
    };
    const result = await postAndPoll(ep.post, ep.prefix, task);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

// ---- 4. App Data: Apple App Store ----------------------------------------

server.tool(
  'app_data_apple_app_store',
  'Search Apple App Store apps or reviews via DataForSEO App Data API',
  {
    keyword: z.string().optional().describe('Search keyword (for search)'),
    app_id: z.string().optional().describe('App ID (for reviews)'),
    type: z.enum(['search', 'reviews']).describe('Query type'),
    location_name: z.string().optional().describe('Location name'),
    language_name: z.string().optional().describe('Language'),
    depth: z.number().optional().describe('Number of results')
  },
  async ({ keyword, app_id, type, location_name, language_name, depth }) => {
    const typeMap = {
      search: { post: '/v3/app_data/apple/app_searches/task_post', prefix: '/v3/app_data/apple/app_searches' },
      reviews: { post: '/v3/app_data/apple/app_reviews/task_post', prefix: '/v3/app_data/apple/app_reviews' }
    };
    const ep = typeMap[type];
    const task = {
      ...(keyword && { keyword }),
      ...(app_id && { app_id }),
      ...(location_name && { location_name }),
      ...(language_name && { language_name }),
      ...(depth && { depth })
    };
    const result = await postAndPoll(ep.post, ep.prefix, task);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

// ---- 5. Reviews: Google --------------------------------------------------

server.tool(
  'reviews_google',
  'Get Google business reviews via DataForSEO Business Data API',
  {
    keyword: z.string().optional().describe('Business name / search keyword'),
    cid: z.string().optional().describe('Google CID (place ID)'),
    location_name: z.string().optional().describe('Location name'),
    language_name: z.string().optional().describe('Language'),
    depth: z.number().optional().describe('Number of reviews')
  },
  async ({ keyword, cid, location_name, language_name, depth }) => {
    const task = {
      ...(keyword && { keyword }),
      ...(cid && { cid }),
      ...(location_name && { location_name }),
      ...(language_name && { language_name }),
      ...(depth && { depth })
    };
    const result = await postAndPoll(
      '/v3/business_data/google/reviews/task_post',
      '/v3/business_data/google/reviews',
      task
    );
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

// ---- 6. Reviews: Trustpilot ----------------------------------------------

server.tool(
  'reviews_trustpilot',
  'Get Trustpilot reviews via DataForSEO Business Data API',
  {
    domain: z.string().describe('Domain name on Trustpilot'),
    depth: z.number().optional().describe('Number of reviews')
  },
  async ({ domain, depth }) => {
    const task = { domain, ...(depth && { depth }) };
    const result = await postAndPoll(
      '/v3/business_data/trustpilot/reviews/task_post',
      '/v3/business_data/trustpilot/reviews',
      task
    );
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

// ---- 7. Social Media Metrics ---------------------------------------------

server.tool(
  'social_media_metrics',
  'Get social engagement metrics (Facebook, Pinterest, Reddit) for URLs via DataForSEO',
  {
    urls: z.array(z.string()).describe('Array of URLs to check'),
    platform: z.enum(['facebook', 'pinterest', 'reddit']).optional().describe('Platform (default: all available)')
  },
  async ({ urls, platform }) => {
    // Social media endpoints use Live method (immediate response, no polling)
    const targets = urls.map(url => ({ target: url }));

    if (platform) {
      const result = await apiPost(`/v3/business_data/social_media/${platform}/live`, targets);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    // Query all three platforms in parallel
    const [fb, pin, reddit] = await Promise.allSettled([
      apiPost('/v3/business_data/social_media/facebook/live', targets),
      apiPost('/v3/business_data/social_media/pinterest/live', targets),
      apiPost('/v3/business_data/social_media/reddit/live', targets)
    ]);

    const combined = {
      facebook: fb.status === 'fulfilled' ? fb.value : { error: fb.reason?.message },
      pinterest: pin.status === 'fulfilled' ? pin.value : { error: pin.reason?.message },
      reddit: reddit.status === 'fulfilled' ? reddit.value : { error: reddit.reason?.message }
    };

    return { content: [{ type: 'text', text: JSON.stringify(combined, null, 2) }] };
  }
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);
