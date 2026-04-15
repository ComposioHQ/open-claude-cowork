/**
 * Stage 4: Brand Speak Engine
 * Generates the Voice Prompt Injection YAML that anchors all future content.
 */

export class BrandSpeakEngine {
  constructor() { this.yamlContent = null; }

  render(container, project, refreshProject) {
    this.project = project; this.refreshProject = refreshProject;
    const state = project.stages[4];
    if (!state || state.status === 'locked') { container.innerHTML = '<div class="coming-soon"><p>Complete Stage 3 to unlock.</p></div>'; return; }
    if (state.status === 'completed') { this.renderCompleted(container); return; }

    container.innerHTML = `
      <div class="voice-container">
        <div class="voice-info">
          <p>The Brand Speak Engine constructs a <strong>Voice Prompt Injection YAML</strong> that becomes the semantic anchor for every piece of content generated from this point forward.</p>
          <p>It includes banned words, cadence rules, tone spectrum, and platform-specific adaptations.</p>
        </div>
        <button class="btn btn-primary" id="generateVoice">Generate Voice YAML</button>
        <div class="generation-status hidden" id="voiceGenStatus"><div class="upload-spinner"></div><span>Building voice architecture...</span></div>
        <div class="voice-editor-section hidden" id="voiceEditorSection">
          <h4>Voice Anchor YAML</h4>
          <p class="panel-desc">Review and edit before locking. This will be injected into all future agent prompts.</p>
          <textarea class="input voice-yaml-editor" id="voiceYamlEditor" rows="20"></textarea>
          <div class="form-actions">
            <button class="btn btn-primary btn-lg" id="lockVoice">Lock Voice & Proceed</button>
            <button class="btn btn-secondary" id="regenerateVoice">Regenerate</button>
          </div>
        </div>
      </div>
    `;

    container.querySelector('#generateVoice').addEventListener('click', () => this.generate());
    container.querySelector('#lockVoice').addEventListener('click', () => this.lockVoice());
    container.querySelector('#regenerateVoice').addEventListener('click', () => this.generate());

    // Load existing voice if any
    this.loadExisting();
  }

  async loadExisting() {
    try {
      const data = await window.opalAPI.getVoiceAnchor(this.project.id);
      if (data.yaml) {
        this.yamlContent = data.yaml;
        this.showEditor(data.yaml);
      }
    } catch (_) {}
  }

  async generate() {
    const status = document.querySelector('#voiceGenStatus');
    const genBtn = document.querySelector('#generateVoice');
    status.classList.remove('hidden');
    genBtn.disabled = true;

    try {
      const stream = await window.opalAPI.generateVoice(this.project.id);
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
          try {
            const data = JSON.parse(line.slice(6).trim());
            if (data.type === 'voice_yaml' && data.yaml) {
              this.yamlContent = data.yaml;
              this.showEditor(data.yaml);
            }
          } catch (_) {}
        }
      }
    } catch (error) {
      console.error('[Voice] Generation error:', error);
    } finally {
      status.classList.add('hidden');
      genBtn.disabled = false;
    }
  }

  showEditor(yaml) {
    document.querySelector('#voiceEditorSection').classList.remove('hidden');
    document.querySelector('#voiceYamlEditor').value = yaml;
  }

  async lockVoice() {
    const yaml = document.querySelector('#voiceYamlEditor').value.trim();
    if (!yaml) return;

    try {
      await window.opalAPI.saveVoiceAnchor(this.project.id, yaml);
      await window.opalAPI.transitionStage(this.project.id, 4, 'completed');
      await this.refreshProject();
    } catch (error) {
      console.error('[Voice] Lock failed:', error);
    }
  }

  renderCompleted(container) {
    container.innerHTML = `<div class="intake-completed"><div class="completion-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="48" height="48"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg></div><h3>Voice Anchor Locked</h3><p>All future agents will use this voice YAML. Ready for Homepage Build.</p></div>`;
  }
}
