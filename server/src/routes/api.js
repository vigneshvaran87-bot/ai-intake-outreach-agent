import { Router } from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Record from '../models/Record.js';
import AgentDecision from '../models/AgentDecision.js';
import DeliveryLog from '../models/DeliveryLog.js';
import { normalizeLead } from '../services/normalizer.js';
import { fetchSyntheticPatients } from '../services/fhirService.js';
import { createAgentDecision } from '../services/aiAgent.js';
import { cmsPayloadSchema, deliverToCms } from '../services/cmsService.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 }, fileFilter: (req, file, cb) => cb(null, /\.csv$/i.test(file.originalname) || file.mimetype === 'text/csv') });
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sampleCsvPath = path.resolve(__dirname, '../../../sample-data/mock_leads.csv');
const safeRecord = doc => ({ ...doc.toObject(), rawPayload: doc.rawPayload });

async function importCsvBuffer(buffer) {
  const rows = parse(buffer, { columns: true, skip_empty_lines: true, bom: true, trim: true, relax_column_count: false });
  const results = { imported: 0, skipped: 0, errors: [] };
  for (let i = 0; i < rows.length; i++) {
    try {
      const normalized = normalizeLead(rows[i]);
      await Record.findOneAndUpdate({ source: normalized.source, sourceId: normalized.sourceId }, { $setOnInsert: normalized }, { upsert: true, new: true, runValidators: true });
      results.imported++;
    } catch (error) { results.skipped++; results.errors.push({ row: i + 2, message: error.message }); }
  }
  return results;
}

router.get('/health', (req, res) => res.json({ ok: true, service: 'ai-intake-outreach-agent', mongo: req.app.locals.mongoReady ? 'connected' : 'disconnected', time: new Date().toISOString() }));
router.get('/records', async (req, res, next) => {
  try {
    const filter = {};
    if (['lead', 'fhir_patient'].includes(req.query.source)) filter.source = req.query.source;
    if (['pending', 'processed', 'failed'].includes(req.query.status)) filter.status = req.query.status;
    const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 500);
    const records = await Record.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
    res.json({ count: records.length, records });
  } catch (e) { next(e); }
});
router.get('/records/:id', async (req, res, next) => {
  try {
    const record = await Record.findById(req.params.id).lean();
    if (!record) return res.status(404).json({ error: 'Record not found' });
    const decision = await AgentDecision.findOne({ record: record._id }).sort({ createdAt: -1 }).lean();
    const deliveries = await DeliveryLog.find({ record: record._id }).sort({ createdAt: -1 }).limit(10).lean();
    res.json({ record, decision, deliveries });
  } catch (e) { next(e); }
});
router.post('/ingest/csv', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Upload a .csv file using form field "file"' });
    const result = await importCsvBuffer(req.file.buffer);
    console.info(JSON.stringify({ level: 'info', event: 'csv_ingestion', ...result }));
    res.json(result);
  } catch (e) { next(e); }
});
router.post('/ingest/sample-csv', async (req, res, next) => {
  try { const buffer = await fs.readFile(sampleCsvPath); res.json(await importCsvBuffer(buffer)); }
  catch (e) { next(e); }
});
router.post('/ingest/fhir', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.body?.limit || process.env.FHIR_PATIENT_LIMIT || 20), 1), 100);
    const fetched = await fetchSyntheticPatients(limit);
    let imported = 0, skipped = 0;
    for (const normalized of fetched.records) {
      try {
        await Record.findOneAndUpdate({ source: normalized.source, sourceId: normalized.sourceId }, { $setOnInsert: normalized }, { upsert: true, new: true, runValidators: true });
        imported++;
      } catch { skipped++; }
    }
    console.info(JSON.stringify({ level: 'info', event: 'fhir_ingestion', fetched: fetched.records.length, imported, skipped, invalidEntries: fetched.errors.length, attempts: fetched.attempts }));
    res.json({ fetched: fetched.records.length, imported, skipped, invalidEntries: fetched.errors, attempts: fetched.attempts });
  } catch (e) { e.status = e.response?.status || 502; next(e); }
});

router.post('/agent/run', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.body?.limit) || 100, 1), 300);
    const records = await Record.find({ status: 'pending' }).sort({ createdAt: 1 }).limit(limit);
    const summary = { selected: records.length, processed: 0, delivered: 0, deliveryFailed: 0, failed: 0, results: [] };
    for (const record of records) {
      let decisionDoc;
      try {
        const decision = await createAgentDecision(record);
        decisionDoc = await AgentDecision.create({ record: record._id, ...decision });
        const payload = {
          schemaVersion: '1.0',
          record: { id: String(record._id), source: record.source, name: record.name.display },
          decision: { classification: decision.classification, score: decision.score, action: decision.action, channel: decision.channel, messageDraft: decision.messageDraft, rationale: decision.rationale },
          metadata: { agentProvider: decision.provider, createdAt: new Date().toISOString() }
        };
        try {
          const delivery = await deliverToCms(payload);
          await DeliveryLog.create({ record: record._id, sourceId: record.sourceId, status: 'delivered', httpStatus: delivery.httpStatus, attempts: delivery.attempts, payload, response: delivery.response });
          record.status = 'processed'; record.lastError = ''; summary.delivered++;
        } catch (error) {
          await DeliveryLog.create({ record: record._id, sourceId: record.sourceId, status: 'failed', httpStatus: error.response?.status || 0, attempts: 3, payload, error: error.message });
          record.status = 'processed'; record.lastError = `CMS delivery failed: ${error.message}`; summary.deliveryFailed++;
        }
        await record.save(); summary.processed++;
        summary.results.push({ id: record._id, sourceId: record.sourceId, name: record.name.display, classification: decision.classification, score: decision.score, provider: decision.provider, delivery: record.lastError ? 'failed' : 'delivered' });
        console.info(JSON.stringify({ level: 'info', event: 'agent_record_complete', sourceId: record.sourceId, classification: decision.classification, provider: decision.provider, delivery: record.lastError ? 'failed' : 'delivered' }));
      } catch (error) {
        record.status = 'failed'; record.lastError = error.message; await record.save(); summary.failed++;
        summary.results.push({ id: record._id, sourceId: record.sourceId, error: error.message });
        console.error(JSON.stringify({ level: 'error', event: 'agent_record_failed', sourceId: record.sourceId, error: error.message }));
      }
    }
    res.json(summary);
  } catch (e) { next(e); }
});
router.get('/agent/runs', async (req, res, next) => {
  try {
    const decisions = await AgentDecision.find().populate('record', 'source sourceId name status').sort({ createdAt: -1 }).limit(100).lean();
    res.json({ count: decisions.length, decisions });
  } catch (e) { next(e); }
});
router.get('/logs', async (req, res, next) => {
  try { const logs = await DeliveryLog.find().sort({ createdAt: -1 }).limit(100).lean(); res.json({ count: logs.length, logs }); }
  catch (e) { next(e); }
});

// Mock downstream CMS: contract validation is deliberately separate from the agent.
router.post('/cms/records', async (req, res, next) => {
  try {
    const payload = cmsPayloadSchema.parse(req.body);
    const received = req.app.locals.cmsReceived || (req.app.locals.cmsReceived = []);
    const receipt = { receiptId: `CMS-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, receivedAt: new Date().toISOString(), recordId: payload.record.id };
    received.push({ ...receipt, payload });
    if (received.length > 1000) received.shift();
    console.info(JSON.stringify({ level: 'info', event: 'mock_cms_received', ...receipt }));
    res.status(201).json({ accepted: true, ...receipt });
  } catch (e) { e.status = 400; next(e); }
});
router.get('/cms/records', (req, res) => {
  const received = req.app.locals.cmsReceived || [];
  res.json({ count: received.length, records: received.slice(-100).reverse() });
});
router.post('/cms/failure-test', async (req, res, next) => {
  const invalidPayload = { schemaVersion: 'broken', record: { id: '', source: 'unknown', name: '' }, decision: {}, metadata: {} };
  try { cmsPayloadSchema.parse(invalidPayload); res.json({ unexpected: true }); }
  catch (error) {
    console.warn(JSON.stringify({ level: 'warn', event: 'deliberate_cms_validation_failure', issueCount: error.issues?.length || 0 }));
    res.status(400).json({ expectedFailure: true, error: 'Deliberate malformed CMS payload rejected by schema validation', details: error.issues || [] });
  }
});

export default router;
