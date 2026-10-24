import axios from 'axios';
import { z } from 'zod';
import { withRetry } from './retry.js';

export const cmsPayloadSchema = z.object({
  schemaVersion: z.literal('1.0'),
  record: z.object({ id: z.string().min(1), source: z.enum(['lead', 'fhir_patient']), name: z.string().min(1) }),
  decision: z.object({ classification: z.string().min(1), score: z.number().min(0).max(100), action: z.string().min(1), channel: z.string().min(1), messageDraft: z.string().min(1), rationale: z.string().min(1) }),
  metadata: z.object({ agentProvider: z.string().min(1), createdAt: z.string().datetime() })
});

export async function deliverToCms(payload) {
  const valid = cmsPayloadSchema.parse(payload);
  const url = process.env.CMS_BASE_URL || 'http://localhost:8080/api/cms/records';
  const result = await withRetry(() => axios.post(url, valid, { timeout: 6000, headers: { 'Content-Type': 'application/json' } }), {
    attempts: 3, delayMs: 250, shouldRetry: e => !e.response || e.response.status >= 500 || e.code === 'ECONNABORTED'
  });
  return { response: result.value.data, attempts: result.attempts, httpStatus: result.value.status };
}
