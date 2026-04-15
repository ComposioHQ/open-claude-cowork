/**
 * OPAL Pipeline - Main Controller
 *
 * Manages the OPAL UI lifecycle: project selection, stage routing,
 * and coordination between the pipeline sidebar and stage content area.
 */

import { PipelineView } from './modules/pipeline-view.js';
import { CovenantGate } from './modules/stage-0-covenant.js';
import { IntakeRouter } from './modules/stage-1-intake.js';
import { LogoFactory } from './modules/stage-2-logo.js';
import { CreativeFoundation } from './modules/stage-3-creative.js';
import { BrandSpeakEngine } from './modules/stage-4-voice.js';
import { HomepageBuild } from './modules/stage-5-homepage.js';
import { ContentEngine } from './modules/stage-6-content.js';

// --- State ---
let currentProject = null;
let pipelineView = null;
const stageModules = {};

// --- DOM References ---
const backToChat = document.getElementById('backToChat');
const projectNameEl = document.getElementById('projectName');
const newProjectBtn = document.getElementById('newProjectBtn');
const welcomeScreen = document.getElementById('welcomeScreen');
const stageView = document.getElementById('stageView');
const stageHeader = document.getElementById('stageHeader');
const stageBody = document.getElementById('stageBody');
const welcomeNewProject = document.getElementById('welcomeNewProject');
const projectList = document.getElementById('projectList');

// Modal
const newProjectModal = document.getElementById('newProjectModal');
const projectNameInput = document.getElementById('projectNameInput');
const modalClose = document.getElementById('modalClose');
const modalCancel = document.getElementById('modalCancel');
const modalCreate = document.getElementById('modalCreate');

// --- Stage Registry ---
const STAGE_NAMES = [
  'Covenant Gate',
  'Intake Router',
  'Logo Factory',
  'Creative Foundation',
  'Brand Speak Engine',
  'Homepage Build',
  'Content Strategy',
];

const STAGE_ICONS = [
  '&#128220;', // scroll
  '&#128269;', // magnifying glass
  '&#9883;',   // hexagram
  '&#127912;', // palette
  '&#128172;', // speech bubble
  '&#127968;', // house
  '&#128197;', // calendar
];

// --- Initialization ---

async function init() {
  setupEventListeners();

  // Initialize pipeline view
  pipelineView = new PipelineView(
    document.getElementById('pipelineStepper'),
    document.getElementById('progressFill'),
    document.getElementById('progressText'),
    onStageClick
  );

  // Load existing projects
  await loadProjects();
}

function setupEventListeners() {
  backToChat.addEventListener('click', () => {
    window.opalAPI.navigateToChat();
  });

  newProjectBtn.addEventListener('click', showNewProjectModal);
  welcomeNewProject.addEventListener('click', showNewProjectModal);

  modalClose.addEventListener('click', hideNewProjectModal);
  modalCancel.addEventListener('click', hideNewProjectModal);
  modalCreate.addEventListener('click', handleCreateProject);

  projectNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleCreateProject();
    if (e.key === 'Escape') hideNewProjectModal();
  });

  // Close modal on overlay click
  newProjectModal.addEventListener('click', (e) => {
    if (e.target === newProjectModal) hideNewProjectModal();
  });
}

// --- Project Management ---

async function loadProjects() {
  try {
    const projects = await window.opalAPI.listProjects();
    renderProjectList(projects);
  } catch (error) {
    console.error('[OPAL] Failed to load projects:', error);
  }
}

function renderProjectList(projects) {
  if (!projects || projects.length === 0) {
    projectList.innerHTML = '';
    return;
  }

  projectList.innerHTML = `
    <h3 class="section-title">Recent Projects</h3>
    <div class="project-cards">
      ${projects.map(p => {
        const completed = p.stages.filter(s => s.status === 'completed').length;
        const currentStage = p.stages.find(s => s.status !== 'locked' && s.status !== 'completed');
        const currentStageName = currentStage ? STAGE_NAMES[currentStage.stage] : 'Complete';
        return `
          <div class="project-card" data-project-id="${p.id}">
            <div class="project-card-header">
              <h4>${escapeHtml(p.name)}</h4>
              <span class="project-progress">${completed}/7</span>
            </div>
            <div class="project-card-body">
              <span class="project-stage-label">Current: ${currentStageName}</span>
              <div class="progress-bar small">
                <div class="progress-fill" style="width: ${(completed / 7) * 100}%"></div>
              </div>
            </div>
            <div class="project-card-footer">
              <span class="project-date">${formatDate(p.created_at)}</span>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  // Add click handlers to project cards
  projectList.querySelectorAll('.project-card').forEach(card => {
    card.addEventListener('click', () => {
      const projectId = card.dataset.projectId;
      openProject(projectId);
    });
  });
}

async function openProject(projectId) {
  try {
    const project = await window.opalAPI.getProject(projectId);
    if (!project || project.error) {
      console.error('[OPAL] Project not found:', projectId);
      return;
    }

    currentProject = project;
    projectNameEl.textContent = project.name;

    // Show pipeline view
    welcomeScreen.classList.add('hidden');
    stageView.classList.remove('hidden');

    // Update pipeline sidebar
    pipelineView.update(project.stages);

    // Navigate to the current active stage
    const activeStage = project.stages.find(s =>
      s.status !== 'locked' && s.status !== 'completed'
    );
    const targetStage = activeStage ? activeStage.stage : 0;
    await loadStage(targetStage);
  } catch (error) {
    console.error('[OPAL] Failed to open project:', error);
  }
}

async function handleCreateProject() {
  const name = projectNameInput.value.trim();
  if (!name) {
    projectNameInput.classList.add('input-error');
    return;
  }

  try {
    const project = await window.opalAPI.createProject(name);
    hideNewProjectModal();
    await openProject(project.id);
  } catch (error) {
    console.error('[OPAL] Failed to create project:', error);
  }
}

function showNewProjectModal() {
  newProjectModal.classList.remove('hidden');
  projectNameInput.value = '';
  projectNameInput.classList.remove('input-error');
  projectNameInput.focus();
}

function hideNewProjectModal() {
  newProjectModal.classList.add('hidden');
}

// --- Stage Navigation ---

async function onStageClick(stageId) {
  if (!currentProject) return;

  const stageState = currentProject.stages.find(s => s.stage === stageId);
  if (!stageState || stageState.status === 'locked') return;

  await loadStage(stageId);
}

async function loadStage(stageId) {
  // Update header
  stageHeader.innerHTML = `
    <div class="stage-title-row">
      <span class="stage-icon">${STAGE_ICONS[stageId]}</span>
      <div>
        <h2 class="stage-title">Stage ${stageId}: ${STAGE_NAMES[stageId]}</h2>
        <span class="stage-status-badge ${getStatusClass(currentProject.stages[stageId]?.status)}">
          ${formatStatus(currentProject.stages[stageId]?.status)}
        </span>
      </div>
    </div>
  `;

  // Clear previous stage content
  stageBody.innerHTML = '';

  // Load the appropriate stage module
  try {
    const module = await getStageModule(stageId);
    if (module) {
      module.render(stageBody, currentProject, refreshProject);
    } else {
      stageBody.innerHTML = `
        <div class="coming-soon">
          <h3>Stage ${stageId}: ${STAGE_NAMES[stageId]}</h3>
          <p>This stage is under construction. Coming in the next build phase.</p>
        </div>
      `;
    }
  } catch (error) {
    console.error(`[OPAL] Failed to load stage ${stageId}:`, error);
    stageBody.innerHTML = `<div class="error-message">Failed to load stage: ${error.message}</div>`;
  }

  // Highlight active stage in sidebar
  pipelineView.setActive(stageId);
}

async function getStageModule(stageId) {
  if (stageModules[stageId]) return stageModules[stageId];

  switch (stageId) {
    case 0:
      stageModules[0] = new CovenantGate();
      return stageModules[0];
    case 1:
      stageModules[1] = new IntakeRouter();
      return stageModules[1];
    case 2:
      stageModules[2] = new LogoFactory();
      return stageModules[2];
    case 3:
      stageModules[3] = new CreativeFoundation();
      return stageModules[3];
    case 4:
      stageModules[4] = new BrandSpeakEngine();
      return stageModules[4];
    case 5:
      stageModules[5] = new HomepageBuild();
      return stageModules[5];
    case 6:
      stageModules[6] = new ContentEngine();
      return stageModules[6];
    default:
      return null;
  }
}

/**
 * Refresh the current project data from the server.
 * Called by stage modules after they make changes.
 */
async function refreshProject() {
  if (!currentProject) return;

  const updated = await window.opalAPI.getProject(currentProject.id);
  if (updated && !updated.error) {
    currentProject = updated;
    pipelineView.update(updated.stages);

    // Re-render current stage header status
    const activeStage = updated.stages.find(s =>
      s.status !== 'locked' && s.status !== 'completed'
    );
    if (activeStage) {
      await loadStage(activeStage.stage);
    }
  }
}

// --- Utilities ---

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatStatus(status) {
  if (!status) return '';
  return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function getStatusClass(status) {
  switch (status) {
    case 'completed': return 'status-completed';
    case 'active': return 'status-active';
    case 'locked': return 'status-locked';
    case 'awaiting_approval': return 'status-awaiting';
    case 'generating': case 'processing': return 'status-generating';
    default: return 'status-active';
  }
}

// --- Boot ---
init();
