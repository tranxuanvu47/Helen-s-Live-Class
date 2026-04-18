import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import { config } from './config';
import { authRouter } from './routes/auth.route';
import { channelRouter } from './routes/channel.route';
import { meetingRouter } from './routes/meeting.route';
import { errorMiddleware } from './middleware/error.middleware';

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. curl, mobile apps)
      if (!origin) return callback(null, true);

      const allowed = [
        // Frontend app – HTTP and HTTPS
        config.frontendUrl,
        config.frontendUrl.replace('http://', 'https://'),
        // LAN access
        'http://10.185.87.49:4200',
        'https://10.185.87.49:4200',
        'http://192.168.31.116:4200',
        'https://192.168.31.116:4200',
        // Widget demo server – local
        'http://localhost:4500',
        'https://localhost:4500',
        'http://127.0.0.1:4500',
        'https://127.0.0.1:4500',
        // Widget demo server – LAN access
        'http://10.185.87.49:4500',
        'https://10.185.87.49:4500',
      ];
      if (allowed.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: origin '${origin}' not allowed`));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);
app.use(morgan('combined'));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRouter);
app.use('/api/channels', channelRouter);
app.use('/api/meetings', meetingRouter);

app.use(errorMiddleware);

// ── Start server ──────────────────────────────────────────────────────────
app.listen(config.port, () => {
  console.log(`Server running on http://localhost:${config.port}`);
  console.log(`Stream API Key: ${config.stream.apiKey.slice(0, 6)}...`);
});
