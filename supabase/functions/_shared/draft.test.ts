import assert from 'node:assert/strict';
import test from 'node:test';
import { validateDraft } from './draft.ts';

test('rejects a title that is too short', () => {
  const result = validateDraft({
    title: 'Wi',
    description: 'The connection drops every few minutes in the reading room.',
    location: 'Library',
    category: 'internet',
  });
  assert.equal(result.ok, false);
});

test('accepts a complaint and trims fields', () => {
  const result = validateDraft({
    title: '  Library Wi-Fi drops  ',
    description: 'The connection drops every few minutes in the reading room.',
    location: ' Central library ',
    category: 'Internet',
    priority: 'HIGH',
    visibility: 'campus',
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.draft.title, 'Library Wi-Fi drops');
    assert.equal(result.draft.location, 'Central library');
    assert.equal(result.draft.category, 'internet');
    assert.equal(result.draft.priority, 'high');
    assert.equal(result.draft.visibility, 'campus');
    assert.equal(result.draft.submission_type, 'complaint');
  }
});

test('rejects an unknown category', () => {
  const result = validateDraft({
    title: 'Broken bench',
    description: 'The bench outside the canteen has a cracked seat.',
    location: 'Canteen',
    category: 'furniture',
  });
  assert.equal(result.ok, false);
});
