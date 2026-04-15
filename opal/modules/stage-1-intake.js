/**
 * Stage 1: The Intake Router
 *
 * Two branches for gathering brand intelligence:
 * - Branch A: Upload a completed questionnaire (PDF/DOCX)
 * - Branch B: Dynamic ADA chatbot interview
 *
 * Quality Gate: Sections C1 (Audience DNA) and H (Competitors) must be complete.
 */

import { ChatAgent } from './chat-agent.js';

export class IntakeRouter {
  constructor() {
    this.chatAgent = null;
    this.currentBranch = null;
  }

  /**
   * Render the Intake Router stage.
   */
  render(container, project, refreshProject) {
    this.project = project;
    this.refreshProject = refreshProject;
    this.container = container;

    const stageState = project.stages[1];
    if (!stageState || stageState.status === 'locked') {
      container.innerHTML = '<div class="coming-soon"><p>Complete Stage 0 to unlock this stage.</p></div>';
      return;
    }

    if (stageState.status === 'completed') {
      this.renderCompleted(container, project);
      return;
    }

    container.innerHTML = `
      <div class="intake-container">
        <!-- Branch Selector -->
        <div class="branch-selector" id="branchSelector">
          <h3>How would you like to provide your brand information?</h3>
          <div class="branch-cards">
            <div class="branch-card" id="branchUpload">
              <div class="branch-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="32" height="32">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="17 8 12 3 7 8"></polyline>
                  <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
              </div>
              <h4>Upload Questionnaire</h4>
              <p>Upload a completed Brand Intelligence Intake Questionnaire (PDF, DOCX, or TXT)</p>
            </div>
            <div class="branch-card" id="branchInterview">
              <div class="branch-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="32" height="32">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
              </div>
              <h4>Guided Interview</h4>
              <p>Chat with our Account Director Agent who will guide you through all 42 questions conversationally</p>
            </div>
          </div>
        </div>

        <!-- Upload Branch -->
        <div class="branch-content hidden" id="uploadBranch">
          <button class="btn btn-secondary back-btn" id="uploadBack">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
            Back
          </button>
          <div class="upload-area" id="uploadArea">
            <div class="upload-dropzone" id="dropzone">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
              <p>Drag & drop your questionnaire here</p>
              <span class="upload-hint">or click to browse (PDF, DOCX, TXT)</span>
              <input type="file" id="fileInput" accept=".pdf,.docx,.txt" hidden>
            </div>
          </div>
          <div class="upload-status hidden" id="uploadStatus">
            <div class="upload-spinner"></div>
            <p id="uploadStatusText">Parsing document...</p>
          </div>
          <div class="upload-results hidden" id="uploadResults">
            <!-- Populated after parsing -->
          </div>
        </div>

        <!-- Interview Branch -->
        <div class="branch-content hidden" id="interviewBranch">
          <button class="btn btn-secondary back-btn" id="interviewBack">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
            Back
          </button>
          <div id="adaChatContainer"></div>
        </div>

        <!-- Intake Progress Panel -->
        <div class="intake-progress" id="intakeProgress">
          <h4>Questionnaire Progress</h4>
          <div id="sectionProgress"></div>
          <div class="gate-status" id="gateStatus"></div>
          <button class="btn btn-primary btn-lg" id="completeIntake" disabled>
            Complete Intake & Proceed
          </button>
        </div>
      </div>
    `;

    this.bindEvents();
    this.loadProgress();
  }

  bindEvents() {
    const branchUpload = this.container.querySelector('#branchUpload');
    const branchInterview = this.container.querySelector('#branchInterview');
    const branchSelector = this.container.querySelector('#branchSelector');
    const uploadBranch = this.container.querySelector('#uploadBranch');
    const interviewBranch = this.container.querySelector('#interviewBranch');

    branchUpload.addEventListener('click', () => {
      branchSelector.classList.add('hidden');
      uploadBranch.classList.remove('hidden');
      this.currentBranch = 'upload';
    });

    branchInterview.addEventListener('click', () => {
      branchSelector.classList.add('hidden');
      interviewBranch.classList.remove('hidden');
      this.currentBranch = 'interview';
      this.initChat();
    });

    // Back buttons
    this.container.querySelector('#uploadBack').addEventListener('click', () => {
      uploadBranch.classList.add('hidden');
      branchSelector.classList.remove('hidden');
      this.currentBranch = null;
    });

    this.container.querySelector('#interviewBack').addEventListener('click', () => {
      interviewBranch.classList.add('hidden');
      branchSelector.classList.remove('hidden');
      this.currentBranch = null;
    });

    // File upload
    const dropzone = this.container.querySelector('#dropzone');
    const fileInput = this.container.querySelector('#fileInput');

    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer.files.length > 0) {
        this.handleFileUpload(e.dataTransfer.files[0]);
      }
    });
    fileInput.addEventListener('change', () => {
      if (fileInput.files.length > 0) {
        this.handleFileUpload(fileInput.files[0]);
      }
    });

    // Complete intake button
    this.container.querySelector('#completeIntake').addEventListener('click', () => {
      this.handleCompleteIntake();
    });
  }

  initChat() {
    const chatContainer = this.container.querySelector('#adaChatContainer');
    this.chatAgent = new ChatAgent(chatContainer, {
      projectId: this.project.id,
      agentName: 'ADA',
      placeholder: 'Tell ADA about your brand...',
      sendFn: (projectId, message) => window.opalAPI.sendAdaMessage(projectId, message),
      onIntakeUpdate: (entries) => this.handleIntakeUpdate(entries),
      onGateStatus: (gate) => this.updateGateStatus(gate),
    });

    // Send an initial greeting to kick off the conversation
    setTimeout(() => {
      this.chatAgent.addMessage('assistant',
        `Hello! I'm your Account Director Agent. I'll be guiding you through our brand intelligence questionnaire — it covers everything from your company foundation to your competitive landscape.\n\nLet's start with the basics. **What's the name of your brand or company, and what do you do?**`
      );
      this.chatAgent.focus();
    }, 300);
  }

  async handleFileUpload(file) {
    const uploadArea = this.container.querySelector('#uploadArea');
    const uploadStatus = this.container.querySelector('#uploadStatus');
    const uploadStatusText = this.container.querySelector('#uploadStatusText');
    const uploadResults = this.container.querySelector('#uploadResults');

    uploadArea.classList.add('hidden');
    uploadStatus.classList.remove('hidden');
    uploadStatusText.textContent = `Parsing ${file.name}...`;

    try {
      const result = await window.opalAPI.uploadIntakeFile(this.project.id, file);

      uploadStatus.classList.add('hidden');

      if (result.error) {
        uploadResults.classList.remove('hidden');
        uploadResults.innerHTML = `<div class="error-message">${result.error}</div>`;
        uploadArea.classList.remove('hidden');
        return;
      }

      uploadResults.classList.remove('hidden');
      uploadResults.innerHTML = `
        <div class="upload-success">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="32" height="32">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
          <h4>Document Parsed Successfully</h4>
          <p><strong>${result.entriesFound}</strong> data points extracted from <em>${escapeHtml(file.name)}</em></p>
        </div>
      `;

      this.loadProgress();
    } catch (error) {
      uploadStatus.classList.add('hidden');
      uploadArea.classList.remove('hidden');
      uploadResults.classList.remove('hidden');
      uploadResults.innerHTML = `<div class="error-message">Upload failed: ${error.message}</div>`;
    }
  }

  handleIntakeUpdate(entries) {
    console.log('[Intake] Updated entries:', entries.length);
    this.loadProgress();
  }

  updateGateStatus(gate) {
    const gateEl = this.container.querySelector('#gateStatus');
    const completeBtn = this.container.querySelector('#completeIntake');

    if (gate.passed) {
      gateEl.innerHTML = `
        <div class="gate-passed">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
          <span>Quality gate passed! All critical sections complete.</span>
        </div>
      `;
      completeBtn.disabled = false;
    } else {
      gateEl.innerHTML = `
        <div class="gate-failed">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <span>Missing critical sections: ${gate.missing.join(', ')}</span>
        </div>
      `;
      completeBtn.disabled = true;
    }
  }

  async loadProgress() {
    try {
      const validation = await window.opalAPI.validateIntake(this.project.id);
      const sectionEl = this.container.querySelector('#sectionProgress');

      if (sectionEl) {
        sectionEl.innerHTML = Object.entries(validation.sections || {}).map(([id, s]) => `
          <div class="section-row ${s.complete ? 'section-complete' : ''} ${s.gateCritical ? 'section-critical' : ''}">
            <span class="section-name">
              ${s.gateCritical ? '<span class="critical-badge">Required</span>' : ''}
              ${id}: ${s.name}
            </span>
            <span class="section-count">${s.answered}/${s.total}</span>
          </div>
        `).join('');
      }

      this.updateGateStatus({
        passed: validation.passed,
        missing: validation.missing,
      });
    } catch (error) {
      console.error('[Intake] Failed to load progress:', error);
    }
  }

  async handleCompleteIntake() {
    try {
      // Transition Stage 1 to completed
      const result = await window.opalAPI.transitionStage(this.project.id, 1, 'completed');
      if (result.success) {
        await this.refreshProject();
      }
    } catch (error) {
      console.error('[Intake] Failed to complete:', error);
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
        <h3>Intake Complete</h3>
        <p>Brand intelligence gathered. Pipeline is ready for Stage 2: Logo Factory.</p>
        <div id="completedSections"></div>
      </div>
    `;

    // Load section summary
    window.opalAPI.validateIntake(project.id).then(validation => {
      const el = container.querySelector('#completedSections');
      if (el) {
        el.innerHTML = `
          <div class="completed-stats">
            <span>${validation.totalAnswered} / ${validation.totalQuestions} questions answered</span>
          </div>
        `;
      }
    });
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
