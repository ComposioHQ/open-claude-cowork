/**
 * Stage 2: The Logo Factory
 *
 * Mathematical Art Form - generates SVG logomarks via geometric proof.
 * Three nodes: Example Router → Vector Generator → Craft Critic
 * Human-in-the-loop approval before advancing.
 */

export class LogoFactory {
  constructor() {
    this.recipes = null;
    this.generatedLogos = [];
    this.selectedLogo = null;
  }

  render(container, project, refreshProject) {
    this.project = project;
    this.refreshProject = refreshProject;
    this.container = container;

    const stageState = project.stages[2];
    if (!stageState || stageState.status === 'locked') {
      container.innerHTML = '<div class="coming-soon"><p>Complete Stage 1 to unlock the Logo Factory.</p></div>';
      return;
    }

    if (stageState.status === 'completed') {
      this.renderCompleted(container, project);
      return;
    }

    container.innerHTML = `
      <div class="logo-factory">
        <!-- Recipe Panel -->
        <div class="logo-panel recipe-panel">
          <h3>Logo Recipes</h3>
          <p class="panel-desc">Matched to your brand archetype</p>
          <div class="recipe-list" id="recipeList">
            <div class="loading-state">Loading recipes...</div>
          </div>
          <div class="custom-prompt-section">
            <label for="customPrompt">Custom Direction (optional)</label>
            <textarea id="customPrompt" class="input" rows="3"
              placeholder="e.g., I want something minimal with a subtle nod to Arabic calligraphy"></textarea>
          </div>
          <button class="btn btn-primary" id="generateBtn">
            Generate Logos
          </button>
        </div>

        <!-- Generator Panel -->
        <div class="logo-panel generator-panel">
          <h3>Generated Logos</h3>
          <div class="logo-grid" id="logoGrid">
            <div class="empty-logo-state">
              <p>Select a recipe and click "Generate" to create logo variations</p>
            </div>
          </div>
          <div class="generation-status hidden" id="genStatus">
            <div class="upload-spinner"></div>
            <span>Generating SVG logos...</span>
          </div>
        </div>

        <!-- Critic Panel -->
        <div class="logo-panel critic-panel">
          <h3>Craft Critic</h3>
          <div id="criticContent">
            <div class="empty-logo-state">
              <p>Select a logo to see its quality assessment</p>
            </div>
          </div>
          <div class="approval-section hidden" id="approvalSection">
            <button class="btn btn-primary btn-lg" id="approveLogo">
              Approve & Save to Vault
            </button>
            <button class="btn btn-secondary" id="regenerateLogo">
              Regenerate
            </button>
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
    this.loadRecipes();
    this.loadExistingLogos();
  }

  bindEvents() {
    this.container.querySelector('#generateBtn').addEventListener('click', () => this.handleGenerate());
    this.container.querySelector('#approveLogo').addEventListener('click', () => this.handleApprove());
    this.container.querySelector('#regenerateLogo').addEventListener('click', () => this.handleGenerate());
  }

  async loadRecipes() {
    try {
      const data = await window.opalAPI.getLogoRecipes(this.project.id);
      this.recipes = data;

      const listEl = this.container.querySelector('#recipeList');
      listEl.innerHTML = `
        <div class="archetype-label">Archetype: <strong>${escapeHtml(data.brandArchetype)}</strong></div>
        ${data.recipes.map((r, i) => `
          <div class="recipe-card ${i === 0 ? 'selected' : ''}" data-index="${i}">
            <h4>${escapeHtml(r.archetype)}</h4>
            <p class="recipe-desc">${escapeHtml(r.description)}</p>
            <div class="recipe-variants">
              ${r.recipes.map(v => `
                <span class="recipe-tag">${escapeHtml(v.name)}</span>
              `).join('')}
            </div>
          </div>
        `).join('')}
      `;

      listEl.querySelectorAll('.recipe-card').forEach(card => {
        card.addEventListener('click', () => {
          listEl.querySelectorAll('.recipe-card').forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');
        });
      });
    } catch (error) {
      console.error('[Logo] Failed to load recipes:', error);
    }
  }

  async loadExistingLogos() {
    try {
      const assets = await window.opalAPI.getVaultAssets(this.project.id, 'logo');
      if (assets && assets.length > 0) {
        // Show existing logos in the grid
        // They'll be fetched as SVG content from vault
      }
    } catch (_) { /* no existing logos yet */ }
  }

  async handleGenerate() {
    const selectedCard = this.container.querySelector('.recipe-card.selected');
    const selectedIndex = selectedCard ? parseInt(selectedCard.dataset.index) : 0;
    const recipe = this.recipes?.recipes[selectedIndex]?.recipes[0] || null;
    const customPrompt = this.container.querySelector('#customPrompt').value.trim() || null;

    const genStatus = this.container.querySelector('#genStatus');
    const logoGrid = this.container.querySelector('#logoGrid');
    const generateBtn = this.container.querySelector('#generateBtn');

    genStatus.classList.remove('hidden');
    generateBtn.disabled = true;
    logoGrid.innerHTML = '';

    let fullText = '';

    try {
      const stream = await window.opalAPI.generateLogo(this.project.id, recipe, customPrompt);
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

            if (data.type === 'text') {
              fullText += data.content;
            } else if (data.type === 'logos') {
              this.generatedLogos = data.results;
              this.renderLogos(data.results);
            } else if (data.type === 'done') {
              break;
            }
          } catch (_) {}
        }
      }
    } catch (error) {
      console.error('[Logo] Generation error:', error);
      logoGrid.innerHTML = `<div class="error-message">Generation failed: ${error.message}</div>`;
    } finally {
      genStatus.classList.add('hidden');
      generateBtn.disabled = false;
    }
  }

  renderLogos(results) {
    const logoGrid = this.container.querySelector('#logoGrid');

    if (!results || results.length === 0) {
      logoGrid.innerHTML = '<div class="empty-logo-state"><p>No valid SVGs were generated. Try again with a different recipe.</p></div>';
      return;
    }

    logoGrid.innerHTML = results.map((r, i) => `
      <div class="logo-card ${r.validation.valid ? '' : 'logo-invalid'}" data-index="${i}">
        <div class="logo-preview">
          ${r.svg}
        </div>
        <div class="logo-meta">
          <span class="logo-label">Variation ${i + 1}</span>
          <span class="validation-badge ${r.validation.valid ? 'valid' : 'invalid'}">
            ${r.validation.valid ? 'Valid' : 'Issues'}
          </span>
        </div>
      </div>
    `).join('');

    logoGrid.querySelectorAll('.logo-card').forEach(card => {
      card.addEventListener('click', () => {
        logoGrid.querySelectorAll('.logo-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        const idx = parseInt(card.dataset.index);
        this.selectedLogo = results[idx];
        this.showCritique(results[idx]);
      });
    });
  }

  async showCritique(logoResult) {
    const criticContent = this.container.querySelector('#criticContent');
    const approvalSection = this.container.querySelector('#approvalSection');

    criticContent.innerHTML = `
      <div class="critique-loading">
        <div class="upload-spinner"></div>
        <span>Running Craft Critic analysis...</span>
      </div>
    `;

    // Show programmatic validation first
    const v = logoResult.validation;
    let critiqueHtml = `
      <div class="structural-check">
        <h4>Structural Check</h4>
        <div class="check-item ${v.valid ? 'check-pass' : 'check-fail'}">
          ${v.valid ? 'PASS' : 'FAIL'} — ${v.errors.length} errors, ${v.warnings.length} warnings
        </div>
        ${v.errors.map(e => `<div class="check-item check-fail">${escapeHtml(e)}</div>`).join('')}
        ${v.warnings.map(w => `<div class="check-item check-warn">${escapeHtml(w)}</div>`).join('')}
        <div class="check-stats">
          Elements: ${v.stats.totalElements} | Size: ${Math.round(v.stats.byteSize / 1024)}KB
        </div>
      </div>
    `;

    criticContent.innerHTML = critiqueHtml;

    if (v.valid) {
      approvalSection.classList.remove('hidden');
    }

    // Run AI critique in background (non-blocking for approval)
    try {
      const stream = await window.opalAPI.critiqueLogo(this.project.id, logoResult.svg);
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
            if (data.type === 'critique' && data.report) {
              critiqueHtml += this.renderCraftReport(data.report);
              criticContent.innerHTML = critiqueHtml;
            }
          } catch (_) {}
        }
      }
    } catch (_) { /* critique is optional enhancement */ }
  }

  renderCraftReport(report) {
    if (!report) return '';
    return `
      <div class="craft-report">
        <h4>AI Quality Assessment</h4>
        <div class="score-overall ${report.pass ? 'score-pass' : 'score-fail'}">
          <span class="score-number">${report.overall_score}</span>
          <span class="score-label">/100 ${report.pass ? 'PASS' : 'NEEDS WORK'}</span>
        </div>
        <div class="criteria-grid">
          ${Object.entries(report.criteria || {}).map(([key, val]) => `
            <div class="criterion">
              <span class="criterion-name">${key.replace(/_/g, ' ')}</span>
              <div class="criterion-bar">
                <div class="criterion-fill" style="width: ${val.score}%"></div>
              </div>
              <span class="criterion-score">${val.score}</span>
            </div>
          `).join('')}
        </div>
        ${(report.recommendations || []).length > 0 ? `
          <div class="recommendations">
            <h5>Recommendations</h5>
            <ul>${report.recommendations.map(r => `<li>${escapeHtml(r)}</li>`).join('')}</ul>
          </div>
        ` : ''}
      </div>
    `;
  }

  async handleApprove() {
    if (!this.selectedLogo || !this.selectedLogo.assetId) return;

    try {
      await window.opalAPI.approveVaultAsset(this.project.id, this.selectedLogo.assetId);
      await window.opalAPI.submitApproval(
        this.project.id, 2, 'logo',
        this.project.covenant_identity || 'User',
        true, 'Logo approved'
      );
      await this.refreshProject();
    } catch (error) {
      console.error('[Logo] Approval failed:', error);
    }
  }

  renderCompleted(container, project) {
    container.innerHTML = `
      <div class="intake-completed">
        <div class="completion-badge">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="48" height="48">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
        </div>
        <h3>Logo Approved</h3>
        <p>Your logomark has been saved to the Asset Vault. Ready for Stage 3.</p>
      </div>
    `;
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}
