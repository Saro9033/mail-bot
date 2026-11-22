import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import cookieParser from 'cookie-parser';
import path from 'path';
import { connectDB } from './config/database';
import authRoutes from './routes/auth';
import chatRoutes from './routes/chat';
import watchdogRoutes from './routes/watchdog';
import { startWatchdogPoller } from './services/watchdog';
import { getDefaultProvider } from './services/agent';
import './types/session';

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/mail-chatbot';
const HEALTH_CHECK_INTERVAL_MS = 2 * 60 * 1000;

if (!process.env.SESSION_SECRET) {
  console.error('SESSION_SECRET is required. Set it in your .env file.');
  process.exit(1);
}

getDefaultProvider();

connectDB();

app.use(express.json());
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});
app.use(cookieParser(process.env.SESSION_SECRET));
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: MONGODB_URI,
      ttl: 30 * 24 * 60 * 60, // 30 days in seconds
    }),
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    },
  })
);

app.use(express.static(path.join(__dirname, '../public')));

app.use('/auth', authRoutes);
app.use('/api', chatRoutes);
app.use('/api/watchdog', watchdogRoutes);

app.listen(PORT, () => {
  console.log(`Mail Chatbot running at http://localhost:${PORT}`);
  const triggerHealthCheck = (): void => {
    fetch(`http://127.0.0.1:${PORT}/health`)
      .then((response) => {
        if (!response.ok) throw new Error(`Health endpoint returned ${response.status}.`);
        console.log('Health check passed.');
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('Health check failed:', message);
      });
  };
  triggerHealthCheck();
  setInterval(triggerHealthCheck, HEALTH_CHECK_INTERVAL_MS);
  startWatchdogPoller();
});
