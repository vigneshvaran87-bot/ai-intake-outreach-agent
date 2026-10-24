import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import apiRouter from './routes/api.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

const app = express();
const port = Number(process.env.PORT || 8080);
app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('tiny'));
app.use(rateLimit({ windowMs: 60_000, limit: 180, standardHeaders: 'draft-7', legacyHeaders: false }));
app.locals.mongoReady = false;
app.locals.cmsReceived = [];
app.use('/api', apiRouter);
app.use(notFound);
app.use(errorHandler);

async function start() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ai_intake_outreach', { serverSelectionTimeoutMS: 5000 });
    app.locals.mongoReady = true;
    console.info(JSON.stringify({ level: 'info', event: 'mongodb_connected' }));
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', event: 'mongodb_connection_failed', message: error.message }));
    console.error('MongoDB is required. Start MongoDB and restart the server.');
    process.exit(1);
  }
  app.listen(port, () => console.info(JSON.stringify({ level: 'info', event: 'server_listening', port })));
}
start();
