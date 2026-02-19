import { getAdminClient } from './client.js';
import { processUnembeddedMessages } from './embeddings.js';

const db = () => getAdminClient();

let embeddingInterval = null;

// Setup pg_cron jobs (run once at startup)
export async function setupCronJobs() {
  try {
    // Cleanup old provider sessions (older than 30 days)
    await db().rpc('query', {
      query_text: `
        SELECT cron.schedule(
          'cleanup-old-sessions',
          '0 3 * * *',
          $$DELETE FROM public.provider_sessions WHERE updated_at < now() - interval '30 days'$$
        );
      `
    }).catch(() => {
      // pg_cron may not be available — non-fatal
      console.log('[CRON] pg_cron not available (this is OK for local dev)');
    });

    // Cleanup orphan embeddings
    await db().rpc('query', {
      query_text: `
        SELECT cron.schedule(
          'cleanup-orphan-embeddings',
          '30 3 * * *',
          $$DELETE FROM public.embeddings WHERE source_type = 'message' AND source_id NOT IN (SELECT id FROM public.messages)$$
        );
      `
    }).catch(() => {
      // non-fatal
    });

    console.log('[CRON] pg_cron jobs scheduled (if available)');
  } catch (err) {
    console.log('[CRON] pg_cron setup skipped:', err.message);
  }
}

// Start Node.js-based embedding pipeline (every 5 minutes)
export function startEmbeddingCron() {
  if (!process.env.OPENAI_API_KEY) {
    console.log('[CRON] Embedding cron skipped (no OPENAI_API_KEY)');
    return;
  }

  // Run immediately once, then every 5 minutes
  processUnembeddedMessages().catch(err => {
    console.error('[CRON] Initial embedding run error:', err.message);
  });

  embeddingInterval = setInterval(() => {
    processUnembeddedMessages().catch(err => {
      console.error('[CRON] Embedding cron error:', err.message);
    });
  }, 5 * 60 * 1000);

  console.log('[CRON] Embedding pipeline started (every 5 min)');
}

// Cleanup
export function stopEmbeddingCron() {
  if (embeddingInterval) {
    clearInterval(embeddingInterval);
    embeddingInterval = null;
  }
}
