/**
 * Pipeline View - Stage Stepper Sidebar
 *
 * Renders the vertical progress stepper showing all 7 pipeline stages
 * with their current status and handles stage navigation clicks.
 */

const STAGE_NAMES = [
  'Covenant Gate',
  'Intake Router',
  'Logo Factory',
  'Creative Foundation',
  'Brand Speak',
  'Homepage Build',
  'Content Strategy',
];

const STATUS_LABELS = {
  locked: 'Locked',
  active: 'Active',
  awaiting_input: 'Awaiting Input',
  processing: 'Processing',
  awaiting_gate: 'Quality Check',
  generating: 'Generating',
  reviewing: 'Reviewing',
  awaiting_approval: 'Needs Approval',
  generating_macro: 'Macro Layer',
  generating_meso: 'Meso Layer',
  generating_micro: 'Micro Layer',
  completed: 'Complete',
};

export class PipelineView {
  constructor(containerEl, progressFillEl, progressTextEl, onStageClick) {
    this.container = containerEl;
    this.progressFill = progressFillEl;
    this.progressText = progressTextEl;
    this.onStageClick = onStageClick;
    this.activeStageId = null;
    this.stages = [];
  }

  /**
   * Update the stepper with new stage data.
   */
  update(stages) {
    this.stages = stages;

    const completed = stages.filter(s => s.status === 'completed').length;
    const total = stages.length;
    const pct = Math.round((completed / total) * 100);

    // Update progress bar
    this.progressFill.style.width = `${pct}%`;
    this.progressText.textContent = `${completed} / ${total}`;

    // Render stepper
    this.container.innerHTML = stages.map((s, i) => {
      const statusClass = this.getStatusClass(s.status);
      const isClickable = s.status !== 'locked';
      const isActive = s.stage === this.activeStageId;

      return `
        <div class="stepper-item ${statusClass} ${isActive ? 'stepper-active' : ''} ${isClickable ? 'stepper-clickable' : ''}"
             data-stage="${s.stage}">
          <div class="stepper-indicator">
            ${s.status === 'completed'
              ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" width="14" height="14"><polyline points="20 6 9 17 4 12"></polyline></svg>'
              : `<span class="stepper-number">${i}</span>`
            }
          </div>
          <div class="stepper-content">
            <span class="stepper-label">${STAGE_NAMES[i]}</span>
            <span class="stepper-status">${STATUS_LABELS[s.status] || s.status}</span>
          </div>
        </div>
      `;
    }).join('');

    // Attach click handlers
    this.container.querySelectorAll('.stepper-clickable').forEach(item => {
      item.addEventListener('click', () => {
        const stageId = parseInt(item.dataset.stage);
        if (this.onStageClick) this.onStageClick(stageId);
      });
    });
  }

  /**
   * Set the visually active stage in the stepper.
   */
  setActive(stageId) {
    this.activeStageId = stageId;

    this.container.querySelectorAll('.stepper-item').forEach(item => {
      const id = parseInt(item.dataset.stage);
      item.classList.toggle('stepper-active', id === stageId);
    });
  }

  getStatusClass(status) {
    switch (status) {
      case 'completed': return 'stepper-completed';
      case 'locked': return 'stepper-locked';
      case 'awaiting_approval': return 'stepper-awaiting';
      default: return 'stepper-in-progress';
    }
  }
}
