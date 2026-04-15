/**
 * Stage 3: Creative Foundation
 * Vibe Creator → Mood Board → Design System Extraction
 */

export class CreativeFoundation {
  constructor() { this.vibes = null; this.sealedVibe = null; }

  render(container, project, refreshProject) {
    this.project = project; this.refreshProject = refreshProject;
    const state = project.stages[3];
    if (!state || state.status === 'locked') { container.innerHTML = '<div class="coming-soon"><p>Complete Stage 2 to unlock.</p></div>'; return; }
    if (state.status === 'completed') { this.renderCompleted(container); return; }

    container.innerHTML = `
      <div class="creative-container">
        <div class="vibe-section">
          <h3>Emotional Vibe Theses</h3>
          <p class="panel-desc">3 distinct emotional directions for your brand — in English and Arabic.</p>
          <button class="btn btn-primary" id="generateVibes">Generate Vibes</button>
          <div class="generation-status hidden" id="vibeStatus"><div class="upload-spinner"></div><span>Generating emotional theses...</span></div>
          <div class="vibe-cards" id="vibeCards"></div>
        </div>
        <div class="design-system-section hidden" id="dsSection">
          <h3>Design System Extraction</h3>
          <p class="panel-desc">Colors, typography, and tokens extracted from your sealed vibe.</p>
          <div class="ds-form">
            <div class="form-group">
              <label>Primary Color</label>
              <input type="text" class="input" id="dsPrimary" placeholder="#2C3E50">
            </div>
            <div class="form-group">
              <label>Secondary Color</label>
              <input type="text" class="input" id="dsSecondary" placeholder="#ECF0F1">
            </div>
            <div class="form-group">
              <label>Accent Color</label>
              <input type="text" class="input" id="dsAccent" placeholder="#3498DB">
            </div>
            <div class="form-group">
              <label>Heading Font</label>
              <input type="text" class="input" id="dsHeadingFont" placeholder="e.g., Playfair Display">
            </div>
            <div class="form-group">
              <label>Body Font</label>
              <input type="text" class="input" id="dsBodyFont" placeholder="e.g., Inter">
            </div>
          </div>
          <button class="btn btn-primary btn-lg" id="lockDesignSystem">Lock Design System & Proceed</button>
        </div>
      </div>
    `;

    container.querySelector('#generateVibes').addEventListener('click', () => this.generateVibes());
    container.querySelector('#lockDesignSystem').addEventListener('click', () => this.lockDesignSystem());
  }

  async generateVibes() {
    const status = this.container || document.querySelector('#vibeStatus');
    const cards = document.querySelector('#vibeCards');
    const btn = document.querySelector('#generateVibes');
    document.querySelector('#vibeStatus').classList.remove('hidden');
    btn.disabled = true;

    try {
      const stream = await window.opalAPI.generateVibes(this.project.id);
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
            if (data.type === 'vibes' && data.theses) {
              this.vibes = data.theses;
              this.renderVibeCards(cards, data.theses);
            }
          } catch (_) {}
        }
      }
    } catch (error) {
      cards.innerHTML = `<div class="error-message">${error.message}</div>`;
    } finally {
      document.querySelector('#vibeStatus').classList.add('hidden');
      btn.disabled = false;
    }
  }

  renderVibeCards(container, theses) {
    container.innerHTML = theses.map((v, i) => `
      <div class="vibe-card" data-index="${i}">
        <div class="vibe-label">${esc(v.label_en)}</div>
        <div class="vibe-label-ar">${esc(v.label_ar)}</div>
        <p class="vibe-desc">${esc(v.description_en)}</p>
        <p class="vibe-desc-ar" dir="rtl">${esc(v.description_ar)}</p>
        <div class="vibe-colors">${(v.color_mood || []).map(c => `<span class="color-dot" style="background:${c}"></span>`).join('')}</div>
        <span class="vibe-energy">Energy: ${esc(v.energy)}</span>
        <button class="btn btn-primary vibe-seal-btn" data-index="${i}">Seal This Vibe</button>
      </div>
    `).join('');

    container.querySelectorAll('.vibe-seal-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.index);
        this.sealVibe(theses[idx], idx);
      });
    });
  }

  sealVibe(vibe, idx) {
    this.sealedVibe = vibe;
    // Fill design system with vibe's colors
    const dsSection = document.querySelector('#dsSection');
    dsSection.classList.remove('hidden');

    const colors = vibe.color_mood || [];
    if (colors[0]) document.querySelector('#dsPrimary').value = colors[0];
    if (colors[1]) document.querySelector('#dsSecondary').value = colors[1];
    if (colors[2]) document.querySelector('#dsAccent').value = colors[2];

    // Highlight selected card
    document.querySelectorAll('.vibe-card').forEach((c, i) => {
      c.classList.toggle('vibe-sealed', i === idx);
    });
  }

  async lockDesignSystem() {
    const colors = {
      primary: document.querySelector('#dsPrimary').value,
      secondary: document.querySelector('#dsSecondary').value,
      accent: document.querySelector('#dsAccent').value,
    };
    const typography = {
      heading: document.querySelector('#dsHeadingFont').value,
      body: document.querySelector('#dsBodyFont').value,
    };

    try {
      await window.opalAPI.saveDesignSystem(this.project.id, {}, typography, colors);
      await window.opalAPI.submitApproval(this.project.id, 3, 'design_system', this.project.covenant_identity || 'User', true, 'Design system locked');
      await this.refreshProject();
    } catch (error) {
      console.error('[Creative] Lock failed:', error);
    }
  }

  renderCompleted(container) {
    container.innerHTML = `<div class="intake-completed"><div class="completion-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="48" height="48"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg></div><h3>Creative Foundation Locked</h3><p>Design system and vibe are sealed. Ready for Brand Speak Engine.</p></div>`;
  }
}

function esc(t) { const d = document.createElement('div'); d.textContent = t || ''; return d.innerHTML; }
