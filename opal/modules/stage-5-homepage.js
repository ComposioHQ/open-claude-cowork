/**
 * Stage 5: Homepage Build
 * TMT Agent + Creative Director Agent → Production HTML with animations
 */

export class HomepageBuild {
  constructor() { this.html = null; }

  render(container, project, refreshProject) {
    this.project = project; this.refreshProject = refreshProject;
    const state = project.stages[5];
    if (!state || state.status === 'locked') { container.innerHTML = '<div class="coming-soon"><p>Complete Stage 4 to unlock.</p></div>'; return; }
    if (state.status === 'completed') { this.renderCompleted(container); return; }

    container.innerHTML = `
      <div class="homepage-container">
        <div class="homepage-controls">
          <h3>Homepage Generator</h3>
          <p class="panel-desc">Generates production-ready HTML with GSAP animations, your design system tokens, and brand voice.</p>
          <button class="btn btn-primary btn-lg" id="generateHomepage">Generate Homepage</button>
          <button class="btn btn-secondary" id="regenerateHomepage" style="display:none">Regenerate</button>
        </div>
        <div class="generation-status hidden" id="hpGenStatus"><div class="upload-spinner"></div><span>Building your homepage...</span></div>
        <div class="homepage-preview-section hidden" id="hpPreviewSection">
          <div class="preview-tabs">
            <button class="tab-btn active" data-tab="preview">Preview</button>
            <button class="tab-btn" data-tab="code">Code</button>
          </div>
          <div class="preview-content" id="previewContent">
            <iframe id="hpPreview" class="homepage-iframe" sandbox="allow-scripts"></iframe>
          </div>
          <div class="code-content hidden" id="codeContent">
            <pre class="code-block"><code id="hpCode"></code></pre>
          </div>
          <div class="form-actions">
            <button class="btn btn-primary btn-lg" id="completeHomepage">Complete Stage & Proceed</button>
            <button class="btn btn-secondary" id="copyCode">Copy Code</button>
          </div>
        </div>
      </div>
    `;

    container.querySelector('#generateHomepage').addEventListener('click', () => this.generate());
    container.querySelector('#completeHomepage').addEventListener('click', () => this.complete());
    container.querySelector('#copyCode').addEventListener('click', () => this.copyCode());

    // Tab switching
    container.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        const tab = e.target.dataset.tab;
        container.querySelector('#previewContent').classList.toggle('hidden', tab !== 'preview');
        container.querySelector('#codeContent').classList.toggle('hidden', tab !== 'code');
      });
    });
  }

  async generate() {
    const status = document.querySelector('#hpGenStatus');
    const btn = document.querySelector('#generateHomepage');
    status.classList.remove('hidden');
    btn.disabled = true;

    try {
      const stream = await window.opalAPI.generateHomepage(this.project.id);
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
            if (data.type === 'homepage' && data.html) {
              this.html = data.html;
              this.showPreview(data.html);
            }
          } catch (_) {}
        }
      }
    } catch (error) {
      console.error('[Homepage] Error:', error);
    } finally {
      status.classList.add('hidden');
      btn.disabled = false;
      document.querySelector('#regenerateHomepage').style.display = '';
    }
  }

  showPreview(html) {
    const section = document.querySelector('#hpPreviewSection');
    section.classList.remove('hidden');

    const iframe = document.querySelector('#hpPreview');
    iframe.srcdoc = html;

    const codeEl = document.querySelector('#hpCode');
    codeEl.textContent = html;
  }

  copyCode() {
    if (this.html) {
      navigator.clipboard.writeText(this.html);
    }
  }

  async complete() {
    try {
      await window.opalAPI.transitionStage(this.project.id, 5, 'completed');
      await this.refreshProject();
    } catch (error) {
      console.error('[Homepage] Complete failed:', error);
    }
  }

  renderCompleted(container) {
    container.innerHTML = `<div class="intake-completed"><div class="completion-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="48" height="48"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg></div><h3>Homepage Built</h3><p>Production HTML exported. Ready for Content Strategy.</p></div>`;
  }
}
