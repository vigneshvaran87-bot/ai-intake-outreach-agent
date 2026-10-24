import mongoose from 'mongoose';
const AgentDecisionSchema = new mongoose.Schema({
  record: { type: mongoose.Schema.Types.ObjectId, ref: 'Record', required: true, index: true },
  classification: { type: String, required: true },
  score: { type: Number, min: 0, max: 100, required: true },
  action: { type: String, required: true },
  channel: { type: String, required: true },
  tone: { type: String, required: true },
  messageDraft: { type: String, required: true },
  rationale: { type: String, required: true },
  provider: { type: String, required: true },
  status: { type: String, enum: ['completed', 'fallback', 'failed'], default: 'completed' },
  error: { type: String, default: '' }
}, { timestamps: true });
export default mongoose.model('AgentDecision', AgentDecisionSchema);
