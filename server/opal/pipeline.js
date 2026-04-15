import {
  getProject,
  getStageState,
  updateStageStatus,
  getIntakeAnswers,
  getVaultAssets,
  getVoiceAnchor,
} from './database.js';

/**
 * OPAL Pipeline - Finite State Machine
 *
 * Manages the 7-stage brand intelligence pipeline.
 * Each stage has defined valid states and transitions.
 * Quality gates guard advancement between stages.
 */

// Stage definitions with metadata
export const STAGES = [
  {
    id: 0,
    name: 'Covenant Gate',
    description: 'Operational philosophy agreement',
    states: ['locked', 'active', 'completed'],
    hasApproval: false,
  },
  {
    id: 1,
    name: 'Intake Router',
    description: 'Brand intelligence gathering',
    states: ['locked', 'active', 'awaiting_input', 'processing', 'awaiting_gate', 'completed'],
    hasApproval: false,
  },
  {
    id: 2,
    name: 'Logo Factory',
    description: 'Mathematical logo generation',
    states: ['locked', 'active', 'generating', 'reviewing', 'awaiting_approval', 'completed'],
    hasApproval: true,
  },
  {
    id: 3,
    name: 'Creative Foundation',
    description: 'Visual & emotional anchor',
    states: ['locked', 'active', 'generating', 'reviewing', 'awaiting_approval', 'completed'],
    hasApproval: true,
  },
  {
    id: 4,
    name: 'Brand Speak Engine',
    description: 'Voice & semantic architecture',
    states: ['locked', 'active', 'generating', 'reviewing', 'completed'],
    hasApproval: false,
  },
  {
    id: 5,
    name: 'Homepage Build',
    description: 'Static & motion execution',
    states: ['locked', 'active', 'generating', 'reviewing', 'completed'],
    hasApproval: false,
  },
  {
    id: 6,
    name: 'Content Strategy',
    description: 'The perpetual engine',
    states: ['locked', 'active', 'generating_macro', 'awaiting_approval', 'generating_meso', 'generating_micro', 'completed'],
    hasApproval: true,
  },
];

// Valid state transitions per stage type
const TRANSITIONS = {
  // Stage 0
  0: {
    locked: ['active'],
    active: ['completed'],
  },
  // Stage 1
  1: {
    locked: ['active'],
    active: ['awaiting_input'],
    awaiting_input: ['processing'],
    processing: ['awaiting_gate'],
    awaiting_gate: ['completed', 'active'], // gate fail → back to active
  },
  // Stages 2, 3 (with HITL approval)
  2: {
    locked: ['active'],
    active: ['generating'],
    generating: ['reviewing'],
    reviewing: ['awaiting_approval'],
    awaiting_approval: ['completed', 'active'], // reject → back to active
  },
  3: {
    locked: ['active'],
    active: ['generating'],
    generating: ['reviewing'],
    reviewing: ['awaiting_approval'],
    awaiting_approval: ['completed', 'active'],
  },
  // Stages 4, 5 (no HITL, just review)
  4: {
    locked: ['active'],
    active: ['generating'],
    generating: ['reviewing'],
    reviewing: ['completed'],
  },
  5: {
    locked: ['active'],
    active: ['generating'],
    generating: ['reviewing'],
    reviewing: ['completed'],
  },
  // Stage 6 (three-layer with macro approval)
  6: {
    locked: ['active'],
    active: ['generating_macro'],
    generating_macro: ['awaiting_approval'],
    awaiting_approval: ['generating_meso', 'active'], // reject → back to active
    generating_meso: ['generating_micro'],
    generating_micro: ['completed'],
  },
};

/**
 * Check if a state transition is valid for a given stage.
 */
export function isValidTransition(stage, fromStatus, toStatus) {
  const stageTransitions = TRANSITIONS[stage];
  if (!stageTransitions) return false;

  const validTargets = stageTransitions[fromStatus];
  if (!validTargets) return false;

  return validTargets.includes(toStatus);
}

/**
 * Transition a stage to a new status.
 * Validates the transition and runs quality gates if needed.
 *
 * @returns {{ success: boolean, error?: string }}
 */
export function transitionStage(projectId, stage, toStatus, node = null) {
  const currentState = getStageState(projectId, stage);
  if (!currentState) {
    return { success: false, error: `Stage ${stage} not found for project ${projectId}` };
  }

  const fromStatus = currentState.status;

  // Validate transition
  if (!isValidTransition(stage, fromStatus, toStatus)) {
    return {
      success: false,
      error: `Invalid transition: Stage ${stage} cannot go from '${fromStatus}' to '${toStatus}'`,
    };
  }

  // Run quality gates for specific transitions
  if (stage === 1 && fromStatus === 'awaiting_gate' && toStatus === 'completed') {
    const gateResult = checkIntakeGate(projectId);
    if (!gateResult.passed) {
      return {
        success: false,
        error: `Intake quality gate failed: missing sections ${gateResult.missing.join(', ')}`,
        gateResult,
      };
    }
  }

  // Perform the transition
  updateStageStatus(projectId, stage, toStatus, node);

  // If completing a stage, unlock the next one
  if (toStatus === 'completed' && stage < 6) {
    const nextStage = getStageState(projectId, stage + 1);
    if (nextStage && nextStage.status === 'locked') {
      updateStageStatus(projectId, stage + 1, 'active');
    }
  }

  return { success: true };
}

/**
 * Advance a project's pipeline to the next logical state.
 * Automatically determines what transition to make based on current state.
 *
 * @returns {{ success: boolean, stage: number, newStatus: string, error?: string }}
 */
export function advancePipeline(projectId) {
  const project = getProject(projectId);
  if (!project) {
    return { success: false, error: 'Project not found' };
  }

  // Find the current active stage
  const activeStage = project.stages.find(s =>
    s.status !== 'locked' && s.status !== 'completed'
  );

  if (!activeStage) {
    // Check if all stages are complete
    const allComplete = project.stages.every(s => s.status === 'completed');
    if (allComplete) {
      return { success: false, error: 'All stages are already completed' };
    }
    return { success: false, error: 'No active stage found' };
  }

  // Get the next valid transition
  const stageTransitions = TRANSITIONS[activeStage.stage];
  const validTargets = stageTransitions[activeStage.status];

  if (!validTargets || validTargets.length === 0) {
    return { success: false, error: `No valid transitions from ${activeStage.status} in Stage ${activeStage.stage}` };
  }

  // Take the first (primary) transition path
  const nextStatus = validTargets[0];
  const result = transitionStage(projectId, activeStage.stage, nextStatus);

  return {
    ...result,
    stage: activeStage.stage,
    previousStatus: activeStage.status,
    newStatus: nextStatus,
  };
}

/**
 * Quality gate: Check that intake questionnaire sections C1 and H are complete.
 */
export function checkIntakeGate(projectId) {
  const answers = getIntakeAnswers(projectId);
  const missing = [];

  // Check Section C1: Audience DNA
  if (!answers.C1 || Object.keys(answers.C1).length === 0) {
    missing.push('C1 (Audience DNA)');
  }

  // Check Section H: Competitors
  if (!answers.H || Object.keys(answers.H).length === 0) {
    missing.push('H (Competitors)');
  }

  return {
    passed: missing.length === 0,
    missing,
  };
}

/**
 * Quality gate: Check that at least one logo is approved in the vault.
 */
export function checkLogoGate(projectId) {
  const logos = getVaultAssets(projectId, 'logo');
  const approved = logos.filter(a => a.approved);
  return {
    passed: approved.length > 0,
    approvedCount: approved.length,
  };
}

/**
 * Quality gate: Check that a voice anchor exists.
 */
export function checkVoiceGate(projectId) {
  const anchor = getVoiceAnchor(projectId);
  return {
    passed: !!anchor,
  };
}

/**
 * Get a summary of the pipeline state for a project.
 */
export function getPipelineSummary(projectId) {
  const project = getProject(projectId);
  if (!project) return null;

  return {
    projectId,
    projectName: project.name,
    covenantAgreed: !!project.covenant_agreed_at,
    stages: project.stages.map(s => ({
      id: s.stage,
      name: STAGES[s.stage].name,
      description: STAGES[s.stage].description,
      status: s.status,
      node: s.node,
      hasApproval: STAGES[s.stage].hasApproval,
      startedAt: s.started_at,
      completedAt: s.completed_at,
    })),
    currentStage: project.stages.find(s => s.status !== 'locked' && s.status !== 'completed')?.stage ?? null,
    completedStages: project.stages.filter(s => s.status === 'completed').length,
    totalStages: 7,
  };
}
