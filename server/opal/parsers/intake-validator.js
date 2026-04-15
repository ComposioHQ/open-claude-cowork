import { getIntakeAnswers } from '../database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load the intake schema
const schemaPath = path.join(__dirname, '..', 'knowledge', 'intake-schema.json');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));

/**
 * Validate that the intake questionnaire meets the quality gate requirements.
 * Gate-critical sections (C1 and H) must have at least 3 answers each.
 *
 * @param {string} projectId
 * @returns {{ passed: boolean, missing: string[], sections: Object }}
 */
export function validateIntake(projectId) {
  const answers = getIntakeAnswers(projectId);
  const missing = [];
  const sectionStatus = {};

  for (const [sectionId, sectionDef] of Object.entries(schema.sections)) {
    const sectionAnswers = answers[sectionId] || {};
    const answeredCount = Object.keys(sectionAnswers).length;
    const totalQuestions = Object.keys(sectionDef.questions).length;
    const isComplete = answeredCount >= Math.min(3, totalQuestions);

    sectionStatus[sectionId] = {
      name: sectionDef.name,
      answered: answeredCount,
      total: totalQuestions,
      complete: isComplete,
      gateCritical: sectionDef.gate_critical || false,
    };

    if (sectionDef.gate_critical && !isComplete) {
      missing.push(`${sectionId} (${sectionDef.name})`);
    }
  }

  return {
    passed: missing.length === 0,
    missing,
    sections: sectionStatus,
    totalAnswered: Object.values(answers).reduce((sum, s) => sum + Object.keys(s).length, 0),
    totalQuestions: schema.total_questions,
  };
}

/**
 * Get the intake schema definition.
 */
export function getIntakeSchema() {
  return schema;
}
