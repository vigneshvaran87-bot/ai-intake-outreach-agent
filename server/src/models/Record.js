import mongoose from 'mongoose';

const RecordSchema = new mongoose.Schema({
  source: { type: String, enum: ['lead', 'fhir_patient'], required: true, index: true },
  sourceId: { type: String, required: true },
  name: { given: String, family: String, display: { type: String, required: true } },
  contact: { email: { type: String, default: null }, phone: { type: String, default: null } },
  context: { summary: { type: String, default: '' }, industry: { type: String, default: '' }, location: { type: String, default: '' }, details: { type: mongoose.Schema.Types.Mixed, default: {} } },
  signals: { priority: { type: String, enum: ['low', 'medium', 'high'], default: 'low' }, tags: { type: [String], default: [] } },
  rawPayload: { type: mongoose.Schema.Types.Mixed, default: {} },
  status: { type: String, enum: ['pending', 'processed', 'failed'], default: 'pending', index: true },
  lastError: { type: String, default: '' }
}, { timestamps: true });
RecordSchema.index({ source: 1, sourceId: 1 }, { unique: true });
export default mongoose.model('Record', RecordSchema);
