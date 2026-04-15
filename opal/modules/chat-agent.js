/**
 * Chat Agent Component
 *
 * A reusable chat interface for conversing with OPAL agents (ADA, etc.).
 * Handles SSE streaming, message rendering, and markdown formatting.
 */

export class ChatAgent {
  constructor(container, options = {}) {
    this.container = container;
    this.projectId = options.projectId;
    this.agentName = options.agentName || 'Agent';
    this.placeholder = options.placeholder || 'Type your message...';
    this.onIntakeUpdate = options.onIntakeUpdate || null;
    this.onGateStatus = options.onGateStatus || null;
    this.sendFn = options.sendFn; // async (projectId, message) => SSE stream
    this.isStreaming = false;
    this.messages = [];

    this.render();
    this.bindEvents();
  }

  render() {
    this.container.innerHTML = `
      <div class="chat-agent">
        <div class="chat-messages" id="agentMessages"></div>
        <div class="chat-input-area">
          <form class="chat-form" id="agentForm">
            <textarea
              class="chat-textarea"
              id="agentInput"
              placeholder="${this.placeholder}"
              rows="1"
            ></textarea>
            <button type="submit" class="btn btn-primary chat-send-btn" id="agentSend">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18">
                <line x1="12" y1="19" x2="12" y2="5"></line>
                <polyline points="5 12 12 5 19 12"></polyline>
              </svg>
            </button>
          </form>
        </div>
      </div>
    `;

    this.messagesEl = this.container.querySelector('#agentMessages');
    this.formEl = this.container.querySelector('#agentForm');
    this.inputEl = this.container.querySelector('#agentInput');
    this.sendBtn = this.container.querySelector('#agentSend');
  }

  bindEvents() {
    this.formEl.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleSend();
    });

    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleSend();
      }
    });

    // Auto-resize textarea
    this.inputEl.addEventListener('input', () => {
      this.inputEl.style.height = 'auto';
      this.inputEl.style.height = Math.min(this.inputEl.scrollHeight, 120) + 'px';
    });
  }

  async handleSend() {
    const message = this.inputEl.value.trim();
    if (!message || this.isStreaming) return;

    // Add user message
    this.addMessage('user', message);
    this.inputEl.value = '';
    this.inputEl.style.height = 'auto';

    // Start streaming
    this.isStreaming = true;
    this.sendBtn.disabled = true;

    const assistantMsgEl = this.addMessage('assistant', '');
    let fullText = '';

    try {
      const stream = await this.sendFn(this.projectId, message);
      const reader = await stream.getReader();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += value;
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          try {
            const data = JSON.parse(jsonStr);

            if (data.type === 'text' && data.content) {
              fullText += data.content;
              this.updateMessageContent(assistantMsgEl, fullText);
            } else if (data.type === 'intake_update' && this.onIntakeUpdate) {
              this.onIntakeUpdate(data.entries);
            } else if (data.type === 'gate_status' && this.onGateStatus) {
              this.onGateStatus(data.gate);
            } else if (data.type === 'done') {
              break;
            } else if (data.type === 'error') {
              this.updateMessageContent(assistantMsgEl, `Error: ${data.message}`);
            }
          } catch (_) { /* skip unparseable */ }
        }
      }
    } catch (error) {
      console.error('[ChatAgent] Stream error:', error);
      this.updateMessageContent(assistantMsgEl, `Connection error: ${error.message}`);
    } finally {
      this.isStreaming = false;
      this.sendBtn.disabled = false;
      this.inputEl.focus();
    }
  }

  addMessage(role, content) {
    const msgEl = document.createElement('div');
    msgEl.className = `chat-msg chat-msg-${role}`;

    const avatarLabel = role === 'user' ? 'You' : this.agentName;
    msgEl.innerHTML = `
      <div class="chat-msg-avatar">${avatarLabel}</div>
      <div class="chat-msg-content">${this.formatContent(content)}</div>
    `;

    this.messagesEl.appendChild(msgEl);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;

    this.messages.push({ role, content });
    return msgEl;
  }

  updateMessageContent(msgEl, content) {
    const contentEl = msgEl.querySelector('.chat-msg-content');
    if (contentEl) {
      contentEl.innerHTML = this.formatContent(content);
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }
  }

  formatContent(text) {
    if (!text) return '<span class="typing-indicator">...</span>';

    // Strip intake_data code blocks from display (they're parsed separately)
    let display = text.replace(/```intake_data[\s\S]*?```/g, '');

    // Basic markdown: bold, italic, headers, lists, code
    display = display
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/^### (.*$)/gm, '<h4>$1</h4>')
      .replace(/^## (.*$)/gm, '<h3>$1</h3>')
      .replace(/^# (.*$)/gm, '<h2>$1</h2>')
      .replace(/^- (.*$)/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>');

    return `<p>${display}</p>`;
  }

  /**
   * Add a system message (not from user or agent).
   */
  addSystemMessage(content) {
    const msgEl = document.createElement('div');
    msgEl.className = 'chat-msg chat-msg-system';
    msgEl.innerHTML = `<div class="chat-msg-content">${content}</div>`;
    this.messagesEl.appendChild(msgEl);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  focus() {
    this.inputEl.focus();
  }
}
