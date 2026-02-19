export const sampleUserMessage = {
  role: 'user',
  content: 'Hello, how are you?'
};

export const sampleAssistantMessage = {
  role: 'assistant',
  content: 'I am doing well, thank you for asking!'
};

export const sampleClaudeChunks = [
  {
    type: 'system',
    subtype: 'init',
    session_id: 'test-session-abc123'
  },
  {
    type: 'assistant',
    message: {
      content: [
        { type: 'text', text: 'Hello! I can help you with that.' }
      ]
    }
  },
  {
    type: 'assistant',
    message: {
      content: [
        {
          type: 'tool_use',
          name: 'Read',
          input: { file_path: '/test/file.js' },
          id: 'tool-123'
        }
      ]
    }
  },
  {
    type: 'tool_result',
    result: 'file contents here',
    tool_use_id: 'tool-123'
  },
  {
    type: 'assistant',
    message: {
      content: [
        { type: 'text', text: 'I found the file.' }
      ]
    }
  }
];

export const sampleSSEChunks = [
  { type: 'connected', message: 'Processing request...' },
  { type: 'text', content: 'Hello!', provider: 'claude' },
  { type: 'tool_use', name: 'Read', input: { file_path: '/test' }, id: 'tu-1', provider: 'claude' },
  { type: 'tool_result', result: 'contents', tool_use_id: 'tu-1', provider: 'claude' },
  { type: 'done', provider: 'claude' }
];

export const sampleChat = {
  id: 'chat-test-123',
  user_id: 'test-user-123',
  title: 'Test Chat',
  provider: 'claude',
  model: null,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T01:00:00Z'
};

export const sampleMessages = [
  {
    id: 'msg-1',
    chat_id: 'chat-test-123',
    user_id: 'test-user-123',
    role: 'user',
    content: 'Hello',
    html: '',
    metadata: {},
    created_at: '2025-01-01T00:00:00Z'
  },
  {
    id: 'msg-2',
    chat_id: 'chat-test-123',
    user_id: 'test-user-123',
    role: 'assistant',
    content: 'Hi there!',
    html: '',
    metadata: { provider: 'claude' },
    created_at: '2025-01-01T00:01:00Z'
  }
];
