import { createApp } from './app';
import { config } from './config/env';
import { connectDatabase } from './config/db';
import { checkRedisHealth } from './config/redis';

const startServer = async () => {
  const app = createApp();

  // Try connecting to DB and Redis in parallel
  await Promise.allSettled([connectDatabase(), checkRedisHealth()]);

  const server = app.listen(config.port, () => {
    console.log(`=======================================================`);
    console.log(` Codebase Onboarder Backend listening on port ${config.port}`);
    console.log(` Environment: ${config.env}`);
    console.log(` AI Service URL: ${config.aiServiceUrl}`);
    console.log(`=======================================================`);
  });

  const shutdown = () => {
    console.log('\nGracefully shutting down backend server...');
    server.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
};

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
