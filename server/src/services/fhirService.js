import axios from 'axios';
import { normalizeFhirPatient } from './normalizer.js';
import { withRetry } from './retry.js';

export async function fetchSyntheticPatients(limit = 20) {
  const base = (process.env.FHIR_BASE_URL || 'https://r4.smarthealthit.org').replace(/\/$/, '');
  const timeout = Number(process.env.FHIR_TIMEOUT_MS || 12000);
  const { value: response, attempts } = await withRetry(() => axios.get(`${base}/Patient`, {
    params: { _count: Math.min(Math.max(Number(limit) || 20, 1), 100), _sort: '-_lastUpdated' }, timeout,
    headers: { Accept: 'application/fhir+json, application/json' }
  }), { attempts: 3, shouldRetry: e => !e.response || e.response.status >= 500 || e.code === 'ECONNABORTED' });
  const entries = Array.isArray(response.data?.entry) ? response.data.entry : [];
  const records = [], errors = [];
  for (const entry of entries) {
    try {
      const resource = entry?.resource;
      if (!resource || resource.resourceType !== 'Patient') throw new Error('Malformed FHIR Bundle entry: expected Patient resource');
      records.push(normalizeFhirPatient(resource));
    } catch (error) { errors.push({ message: error.message, resourceId: entry?.resource?.id || null }); }
  }
  return { records, errors, attempts, totalEntries: entries.length };
}
