import { vi, describe, it, expect, beforeEach } from 'vitest';
import { resetMockDB, seedTable, createMockSupabaseClient } from '../../../mocks/supabase.js';

const mockClient = createMockSupabaseClient();

vi.mock('../../../../server/supabase/client.js', () => ({
  getAdminClient: vi.fn(() => mockClient),
  getUserClient: vi.fn(() => mockClient),
  getPublicConfig: vi.fn(() => ({ supabaseUrl: 'https://test.supabase.co', supabaseAnonKey: 'test-anon-key' }))
}));

// Mock crypto.randomUUID to return a predictable value
vi.mock('crypto', () => ({
  default: {
    randomUUID: vi.fn(() => 'test-uuid-1234')
  },
  randomUUID: vi.fn(() => 'test-uuid-1234')
}));

import { uploadFile, getFileUrl, deleteFile } from '../../../../server/supabase/storage.js';

describe('storage.js', () => {
  beforeEach(() => {
    resetMockDB();
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  });

  describe('uploadFile', () => {
    it('uploads file to storage and creates an attachment record', async () => {
      seedTable('attachments', []);

      const file = {
        originalname: 'document.pdf',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('fake-pdf-content')
      };

      const result = await uploadFile('user-1', file, 'chat-1');

      expect(result).toBeDefined();
      expect(result.user_id).toBe('user-1');
      expect(result.chat_id).toBe('chat-1');
      expect(result.file_name).toBe('document.pdf');
      expect(result.file_type).toBe('application/pdf');
      expect(result.file_size).toBe(1024);
      expect(result.storage_path).toBe('user-1/test-uuid-1234.pdf');
    });

    it('handles files without a chat_id', async () => {
      seedTable('attachments', []);

      const file = {
        originalname: 'image.png',
        mimetype: 'image/png',
        size: 512,
        buffer: Buffer.from('fake-png')
      };

      const result = await uploadFile('user-1', file);

      expect(result.chat_id).toBeNull();
      expect(result.file_name).toBe('image.png');
    });

    it('constructs storage path from userId and file extension', async () => {
      seedTable('attachments', []);

      const file = {
        originalname: 'archive.tar.gz',
        mimetype: 'application/gzip',
        size: 2048,
        buffer: Buffer.from('fake-archive')
      };

      const result = await uploadFile('user-42', file, 'chat-5');

      // Extension extracted from last part after '.'
      expect(result.storage_path).toBe('user-42/test-uuid-1234.gz');
    });
  });

  describe('getFileUrl', () => {
    it('returns a signed URL for the attachment', async () => {
      seedTable('attachments', [
        { id: 'att-1', user_id: 'user-1', storage_path: 'user-1/abc.pdf' }
      ]);

      const url = await getFileUrl('att-1', 'user-1');

      expect(url).toContain('user-1/abc.pdf');
      expect(url).toContain('signed');
      expect(url).toContain('expires=3600');
    });

    it('throws when attachment is not found', async () => {
      seedTable('attachments', []);

      await expect(getFileUrl('nonexistent', 'user-1')).rejects.toEqual(
        expect.objectContaining({ code: 'PGRST116' })
      );
    });

    it('does not return URL for attachments owned by other users', async () => {
      seedTable('attachments', [
        { id: 'att-1', user_id: 'user-2', storage_path: 'user-2/secret.pdf' }
      ]);

      await expect(getFileUrl('att-1', 'user-1')).rejects.toEqual(
        expect.objectContaining({ code: 'PGRST116' })
      );
    });
  });

  describe('deleteFile', () => {
    it('removes file from storage and deletes the attachment record', async () => {
      seedTable('attachments', [
        { id: 'att-1', user_id: 'user-1', storage_path: 'user-1/doc.pdf' },
        { id: 'att-2', user_id: 'user-1', storage_path: 'user-1/other.pdf' }
      ]);

      await deleteFile('att-1', 'user-1');

      // The attachment record should be removed
      // Verify by trying to get it (should throw not found)
      await expect(getFileUrl('att-1', 'user-1')).rejects.toEqual(
        expect.objectContaining({ code: 'PGRST116' })
      );
    });

    it('throws when trying to delete nonexistent attachment', async () => {
      seedTable('attachments', []);

      await expect(deleteFile('nonexistent', 'user-1')).rejects.toEqual(
        expect.objectContaining({ code: 'PGRST116' })
      );
    });

    it('does not delete attachments belonging to other users', async () => {
      seedTable('attachments', [
        { id: 'att-1', user_id: 'user-2', storage_path: 'user-2/secret.pdf' }
      ]);

      await expect(deleteFile('att-1', 'user-1')).rejects.toEqual(
        expect.objectContaining({ code: 'PGRST116' })
      );
    });
  });
});
