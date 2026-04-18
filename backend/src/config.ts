import dotenv from 'dotenv';

dotenv.config();

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env variable: ${key}`);
  return val;
}

export const config = {
  port: parseInt(process.env['PORT'] ?? '3000', 10),
  frontendUrl: process.env['FRONTEND_URL'] ?? 'http://localhost:4200',
  stream: {
    apiKey: requireEnv('STREAM_API_KEY'),
    apiSecret: requireEnv('STREAM_API_SECRET'),
  },
} as const;
