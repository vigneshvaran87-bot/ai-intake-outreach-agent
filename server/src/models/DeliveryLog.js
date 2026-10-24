import mongoose from 'mongoose';
const DeliveryLogSchema = new mongoose.Schema({
  record: { type: mongoose.Schema.Types.ObjectId, ref: 'Record', index: true },
  sourceId: String,
  destination: { type: String, default: 'local_mock_cms' },
  status: { type: String, enum: ['delivered', 'failed'], required: true },
  httpStatus: Number,
  attempts: { type: Number, default: 1 },
  payload: mongoose.Schema.Types.Mixed,
  response: mongoose.Schema.Types.Mixed,
  error: String
}, { timestamps: true });
export default mongoose.model('DeliveryLog', DeliveryLogSchema);
