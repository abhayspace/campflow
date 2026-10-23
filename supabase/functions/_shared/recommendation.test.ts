import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeRecommendation } from './recommendation.ts';

const base = {
  problem_summary: 'The library Wi-Fi on the second floor is reported as unavailable.',
  recommended_solution: 'Ask IT to check whether the outage is local to that floor before replacing any equipment.',
  action_steps: [
    'Check whether more than one person and device is affected.',
    'Confirm the access in the reported area.',
    'Escalate to the configured IT department if the outage continues.',
  ],
  suggested_department: 'Information Technology',
  suggested_priority: 'medium',
  priority_reason: 'Several people may be affected, but no safety hazard is described.',
  effort_estimate: 'Medium',
  missing_information: ['When it started'],
  confidence_notes: 'The report does not show a failed device.',
};

test('maps a configured department and keeps the suggestion', () => {
  const result = normalizeRecommendation(base, { departments: ['Information Technology'], safetyFlagged: false });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.draft.suggested_department, 'Information Technology');
  assert.equal(result.draft.action_steps.length, 3);
  assert.equal(result.draft.effort_estimate, 'Medium');
});

test('does not invent a department that is not configured', () => {
  const result = normalizeRecommendation(
    { ...base, suggested_department: 'Secret Robotics Lab' },
    { departments: ['Facilities'], safetyFlagged: false },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.draft.suggested_department, null);
  assert.match(result.draft.confidence_notes, /No configured department/);
});

test('raises urgency when the complaint is already safety flagged', () => {
  const result = normalizeRecommendation(
    { ...base, suggested_priority: 'low' },
    { departments: ['Facilities'], safetyFlagged: true },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.draft.suggested_priority, 'urgent');
  assert.match(result.draft.priority_reason, /safety/);
});

test('rejects a recommendation without enough steps', () => {
  const result = normalizeRecommendation({ ...base, action_steps: ['Look at it.'] }, { departments: [], safetyFlagged: false });
  assert.equal(result.ok, false);
});
