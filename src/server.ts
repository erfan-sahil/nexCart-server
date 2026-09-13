import 'dotenv/config';
import { env } from './config/env';
import { createApp } from './app';

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`NexCart API running on http://localhost:${env.PORT} [${env.NODE_ENV}]`);
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${env.PORT} is already in use`);
    process.exit(1);
  }

  throw err;
});

const shutdown = (signal: string) => {
  console.log(`${signal} received. Closing server...`);
  server.close(() => {
    process.exit(0);
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
