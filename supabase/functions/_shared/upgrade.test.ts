import assert from 'node:assert/strict';
import test from 'node:test';
import {
  defaultCriteria, dossierForAudience, hoursBetween, memoryOutcome, normalizeCriteria, recurrenceReason,
} from './upgrade.ts';

test('rejects an unknown memory outcome', () => {
  assert.equal(memoryOutcome('successful'), 'successful');
  assert.equal(memoryOutcome('fixed'), null);
});

test('safety checklist is explicit and does not claim the ticket is resolved', () => {
  const items = defaultCriteria('electricity', true);
  assert.match(items[0]!.label, /escalation stays in force/);
  assert.equal(items.some((item) => /resolved/i.test(item.label) && /automatically/i.test(item.label)), false);
});

test('falls back when the model returns too little', () => {
  const items = normalizeCriteria([{ label: 'short', evidence_required: 'x' }], defaultCriteria('internet', false));
  assert.ok(items.length >= 3);
  assert.equal(items[0]!.source, 'rule');
});

test('recurrence wording does not call the earlier repair a failure', () => {
  const text = recurrenceReason(30);
  assert.match(text, /not evidence that the earlier repair failed/);
  assert.equal(/failed repair/.test(text), false);
});

test('elapsed hours use the two timestamps', () => {
  const hours = hoursBetween('2026-01-02T12:00:00.000Z', '2026-01-01T12:00:00.000Z');
  assert.equal(hours, 24);
});

test('a student dossier drops staff notes and hypotheses', () => {
  const body = dossierForAudience({
    verified_facts: ['Ticket CC-1 is open.'],
    historical_records: ['CC-2 was resolved.', 'Internal staff note: ignored'],
    staff_notes: ['Check the plant room'],
    ai_hypotheses: ['Maybe the switch'],
    next_steps: ['Inspect the reported area'],
    policy_excerpts: [],
  }, 'student');
  assert.deepEqual(body.staff_notes, []);
  assert.deepEqual(body.ai_hypotheses, []);
  assert.equal(body.historical_records.length, 1);
});
