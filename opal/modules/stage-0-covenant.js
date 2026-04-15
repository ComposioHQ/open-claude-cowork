/**
 * Stage 0: The Covenant Gate
 *
 * Before any logic runs, the system enforces the operational philosophy.
 * User must agree to the covenant and provide their identity as the Decision-Maker.
 */

const COVENANT_TEXT = `
<h3>The OPAL Covenant</h3>

<p>Before we begin building your brand system, you must agree to the foundational principle
that governs how this system operates.</p>

<p>OPAL is designed to <strong>augment human creativity</strong>, not replace it.
Every decision flows through you. Every output serves your team. The pipeline amplifies
what your people already do best.</p>

<blockquote>
  <p><em>"Technology is a lever, not a replacement. The best brands are built by empowered
  teams using intelligent tools &mdash; never by tools alone."</em></p>
</blockquote>

<h4>By proceeding, you affirm:</h4>
<ul>
  <li>This system will be used to <strong>grow your team's capabilities</strong>, not shrink your team.</li>
  <li>Every AI-generated output will be <strong>reviewed and approved by a human</strong> before going live.</li>
  <li>You are the <strong>Decision-Maker</strong> &mdash; the system advises, you decide.</li>
  <li>Brand authenticity comes from <strong>your vision</strong>, enhanced by intelligent automation.</li>
</ul>
`;

export class CovenantGate {
  constructor() {
    this.agreed = false;
  }

  /**
   * Render the Covenant Gate stage into the provided container.
   *
   * @param {HTMLElement} container - The stage body container
   * @param {Object} project - The current project data
   * @param {Function} refreshProject - Callback to refresh project state
   */
  render(container, project, refreshProject) {
    const isCompleted = project.stages[0]?.status === 'completed';

    if (isCompleted) {
      this.renderCompleted(container, project);
      return;
    }

    container.innerHTML = `
      <div class="covenant-container">
        <div class="covenant-text">
          ${COVENANT_TEXT}
        </div>

        <div class="covenant-form">
          <div class="form-group">
            <label for="covenantIdentity">Decision-Maker Identity</label>
            <input type="text" id="covenantIdentity" class="input"
                   placeholder="Your name and role (e.g., Sarah Chen, Brand Director)"
                   autocomplete="name">
          </div>

          <div class="form-group checkbox-group">
            <label class="checkbox-label">
              <input type="checkbox" id="covenantAgree">
              <span class="checkbox-text">
                <strong>I agree.</strong> My team grows with this system, not shrinks.
              </span>
            </label>
          </div>

          <div class="form-actions">
            <button class="btn btn-primary btn-lg" id="covenantSubmit" disabled>
              Accept Covenant &amp; Begin
            </button>
          </div>

          <p class="covenant-note">
            This agreement is logged with your identity and timestamp for accountability.
          </p>
        </div>
      </div>
    `;

    // Event handlers
    const identityInput = container.querySelector('#covenantIdentity');
    const agreeCheckbox = container.querySelector('#covenantAgree');
    const submitBtn = container.querySelector('#covenantSubmit');

    const updateSubmitState = () => {
      const canSubmit = identityInput.value.trim().length > 0 && agreeCheckbox.checked;
      submitBtn.disabled = !canSubmit;
    };

    identityInput.addEventListener('input', updateSubmitState);
    agreeCheckbox.addEventListener('change', updateSubmitState);

    submitBtn.addEventListener('click', async () => {
      const identity = identityInput.value.trim();
      if (!identity || !agreeCheckbox.checked) return;

      submitBtn.disabled = true;
      submitBtn.textContent = 'Processing...';

      try {
        const result = await window.opalAPI.agreeCovenant(project.id, identity);
        if (result.success) {
          this.agreed = true;
          await refreshProject();
        } else {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Accept Covenant & Begin';
          alert('Error: ' + (result.error || 'Unknown error'));
        }
      } catch (error) {
        console.error('[Covenant] Error:', error);
        submitBtn.disabled = false;
        submitBtn.textContent = 'Accept Covenant & Begin';
      }
    });
  }

  renderCompleted(container, project) {
    container.innerHTML = `
      <div class="covenant-container completed">
        <div class="completion-badge">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="48" height="48">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
        </div>
        <h3>Covenant Accepted</h3>
        <p>Agreed by <strong>${escapeHtml(project.covenant_identity || 'Unknown')}</strong></p>
        <p class="timestamp">on ${formatDateTime(project.covenant_agreed_at)}</p>
        <div class="covenant-text-collapsed">
          ${COVENANT_TEXT}
        </div>
      </div>
    `;
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDateTime(dateStr) {
  if (!dateStr) return 'Unknown date';
  const d = new Date(dateStr);
  return d.toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
