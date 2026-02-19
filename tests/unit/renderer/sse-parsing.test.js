import { describe, it, expect } from 'vitest';
import { parseSSEText, collectSSEChunks } from '../../helpers/sse-helper.js';

describe('SSE parsing', () => {
  describe('parseSSEText', () => {
    it('parses data: lines into JSON objects', () => {
      const text = 'data: {"type":"text","content":"Hello"}\n\ndata: {"type":"done"}\n\n';
      const chunks = parseSSEText(text);
      expect(chunks).toHaveLength(2);
      expect(chunks[0]).toEqual({ type: 'text', content: 'Hello' });
      expect(chunks[1]).toEqual({ type: 'done' });
    });

    it('skips heartbeat comments', () => {
      const text = ': heartbeat\n\ndata: {"type":"text","content":"hi"}\n\n: heartbeat\n\n';
      const chunks = parseSSEText(text);
      expect(chunks).toHaveLength(1);
      expect(chunks[0].content).toBe('hi');
    });

    it('skips empty lines', () => {
      const text = '\n\n\ndata: {"type":"done"}\n\n\n';
      const chunks = parseSSEText(text);
      expect(chunks).toHaveLength(1);
    });

    it('skips non-JSON data lines', () => {
      const text = 'data: not json\ndata: {"type":"ok"}\n';
      const chunks = parseSSEText(text);
      expect(chunks).toHaveLength(1);
      expect(chunks[0].type).toBe('ok');
    });

    it('handles connected + text + tool_use + tool_result + done sequence', () => {
      const text = [
        'data: {"type":"connected","message":"Processing..."}',
        '',
        'data: {"type":"text","content":"Let me help","provider":"claude"}',
        '',
        ': heartbeat',
        '',
        'data: {"type":"tool_use","name":"Read","input":{"file_path":"/test"},"id":"t1","provider":"claude"}',
        '',
        'data: {"type":"tool_result","result":"contents","tool_use_id":"t1","provider":"claude"}',
        '',
        'data: {"type":"text","content":" with that.","provider":"claude"}',
        '',
        'data: {"type":"done","provider":"claude"}',
        ''
      ].join('\n');

      const chunks = parseSSEText(text);
      expect(chunks).toHaveLength(6);
      expect(chunks[0].type).toBe('connected');
      expect(chunks[1].type).toBe('text');
      expect(chunks[2].type).toBe('tool_use');
      expect(chunks[2].name).toBe('Read');
      expect(chunks[3].type).toBe('tool_result');
      expect(chunks[4].type).toBe('text');
      expect(chunks[5].type).toBe('done');
    });

    it('handles error chunks', () => {
      const text = 'data: {"type":"error","message":"Something went wrong"}\n\n';
      const chunks = parseSSEText(text);
      expect(chunks[0]).toEqual({ type: 'error', message: 'Something went wrong' });
    });

    it('handles aborted chunks', () => {
      const text = 'data: {"type":"aborted","provider":"claude"}\n\n';
      const chunks = parseSSEText(text);
      expect(chunks[0]).toEqual({ type: 'aborted', provider: 'claude' });
    });
  });

  describe('collectSSEChunks', () => {
    it('is an alias for parseSSEText', () => {
      const text = 'data: {"type":"done"}\n\n';
      expect(collectSSEChunks(text)).toEqual(parseSSEText(text));
    });
  });
});
