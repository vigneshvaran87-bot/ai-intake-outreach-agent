import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLead, normalizeFhirPatient } from './normalizer.js';

test('normalizes CSV lead into shared schema and detects engagement', () => {
  const record = normalizeLead({ lead_id: 'L1', full_name: 'Ada Lovelace', recent_activity: 'Liked a post about automation', company: 'Example Co' });
  assert.equal(record.source, 'lead');
  assert.equal(record.name.display, 'Ada Lovelace');
  assert.equal(record.signals.priority, 'medium');
  assert.equal(record.status, 'pending');
});

test('rejects FHIR patient missing resource id', () => {
  assert.throws(() => normalizeFhirPatient({ resourceType: 'Patient' }), /missing id/);
});

