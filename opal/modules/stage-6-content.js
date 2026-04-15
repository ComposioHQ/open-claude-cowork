/**
 * Stage 6: Content Strategy Engine
 * Macro (90-day arc) → Meso (weekly pillars) → Micro (specific assets)
 */

export class ContentEngine {
  constructor() { this.macroData = null; this.mesoData = null; this.microData = null; }

  render(container, project, refreshProject) {
    this.project = project; this.refreshProject = refreshProject;
    const state = project.stages[6];
    if (!state || state.status === 'locked') { container.innerHTML = '<div class="coming-soon"><p>Complete Stage 5 to unlock.</p></div>'; return; }
    if (state.status === 'completed') { this.renderCompleted(container); return; }

    container.innerHTML = `
      <div class="content-container">
        <div class="content-layers">
          <!-- Macro Layer -->
          <div class="content-layer" id="macroLayer">
            <h3>Layer 1: 90-Day Narrative Arc</h3>
            <p class="panel-desc">3-month content strategy with monthly themes and content ratios.</p>
            <button class="btn btn-primary" id="genMacro">Generate Arc</button>
            <div class="generation-status hidden" id="macroStatus"><div class="upload-spinner"></div><span>Generating 90-day arc...</span></div>
            <div class="layer-output" id="macroOutput"></div>
            <button class="btn btn-primary hidden" id="approveMacro">Approve Arc & Continue</button>
          </div>

          <!-- Meso Layer -->
          <div class="content-layer locked-layer" id="mesoLayer">
            <h3>Layer 2: Weekly Content Pillars</h3>
            <p class="panel-desc">Weekly content pillars mapped to audience pain points.</p>
            <button class="btn btn-primary" id="genMeso" disabled>Generate Pillars</button>
            <div class="generation-status hidden" id="mesoStatus"><div class="upload-spinner"></div><span>Breaking down weekly pillars...</span></div>
            <div class="layer-output" id="mesoOutput"></div>
          </div>

          <!-- Micro Layer -->
          <div class="content-layer locked-layer" id="microLayer">
            <h3>Layer 3: Content Assets</h3>
            <p class="panel-desc">LinkedIn carousels, Twitter hooks, email sequences — ready to schedule.</p>
            <button class="btn btn-primary" id="genMicro" disabled>Generate Assets</button>
            <div class="generation-status hidden" id="microStatus"><div class="upload-spinner"></div><span>Creating content assets...</span></div>
            <div class="layer-output" id="microOutput"></div>
          </div>
        </div>

        <button class="btn btn-primary btn-lg hidden" id="completeContent">Complete Content Strategy</button>
      </div>
    `;

    container.querySelector('#genMacro').addEventListener('click', () => this.generateLayer('macro'));
    container.querySelector('#genMeso').addEventListener('click', () => this.generateLayer('meso'));
    container.querySelector('#genMicro').addEventListener('click', () => this.generateLayer('micro'));
    container.querySelector('#approveMacro').addEventListener('click', () => this.approveMacro());
    container.querySelector('#completeContent').addEventListener('click', () => this.complete());
  }

  async generateLayer(layer) {
    const statusEl = document.querySelector(`#${layer}Status`);
    const outputEl = document.querySelector(`#${layer}Output`);
    const btn = document.querySelector(`#gen${layer.charAt(0).toUpperCase() + layer.slice(1)}`);

    statusEl.classList.remove('hidden');
    btn.disabled = true;

    try {
      const stream = await window.opalAPI.generateContent(this.project.id, layer);
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
            if (data.type === 'content' && data.data) {
              this[`${layer}Data`] = data.data;
              this.renderLayerOutput(outputEl, layer, data.data);
              this.unlockNextLayer(layer);
            }
          } catch (_) {}
        }
      }
    } catch (error) {
      outputEl.innerHTML = `<div class="error-message">${error.message}</div>`;
    } finally {
      statusEl.classList.add('hidden');
      btn.disabled = false;
    }
  }

  renderLayerOutput(el, layer, data) {
    if (layer === 'macro') {
      el.innerHTML = `
        <div class="macro-arc">
          <h4>${esc(data.arc_title || '90-Day Arc')}</h4>
          ${(data.months || []).map(m => `
            <div class="month-card">
              <div class="month-header">Month ${m.month}: <strong>${esc(m.theme)}</strong></div>
              <p>${esc(m.narrative)}</p>
              <div class="content-ratio">
                ${Object.entries(m.content_ratio || {}).map(([k, v]) => `<span class="ratio-tag">${k}: ${v}%</span>`).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      `;
      document.querySelector('#approveMacro').classList.remove('hidden');
    } else if (layer === 'meso') {
      el.innerHTML = `<div class="meso-output"><pre>${JSON.stringify(data, null, 2)}</pre></div>`;
    } else if (layer === 'micro') {
      el.innerHTML = `<div class="micro-output"><pre>${JSON.stringify(data, null, 2)}</pre></div>`;
      document.querySelector('#completeContent').classList.remove('hidden');
    }
  }

  unlockNextLayer(layer) {
    if (layer === 'macro') {
      document.querySelector('#mesoLayer').classList.remove('locked-layer');
      document.querySelector('#genMeso').disabled = false;
    } else if (layer === 'meso') {
      document.querySelector('#microLayer').classList.remove('locked-layer');
      document.querySelector('#genMicro').disabled = false;
    }
  }

  async approveMacro() {
    try {
      await window.opalAPI.submitApproval(this.project.id, 6, 'macro', this.project.covenant_identity || 'User', true, 'Macro arc approved');
      document.querySelector('#approveMacro').classList.add('hidden');
      this.unlockNextLayer('macro');
    } catch (error) {
      console.error('[Content] Macro approval failed:', error);
    }
  }

  async complete() {
    try {
      await window.opalAPI.transitionStage(this.project.id, 6, 'completed');
      await this.refreshProject();
    } catch (error) {
      console.error('[Content] Complete failed:', error);
    }
  }

  renderCompleted(container) {
    container.innerHTML = `<div class="intake-completed"><div class="completion-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="48" height="48"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg></div><h3>Content Strategy Complete</h3><p>Your 90-day content calendar with platform-specific assets is ready. The OPAL Pipeline is complete!</p></div>`;
  }
}

function esc(t) { const d = document.createElement('div'); d.textContent = t || ''; return d.innerHTML; }
