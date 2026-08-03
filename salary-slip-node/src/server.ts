import { buildApp } from './app.js';
import { env } from './config/env.js';

/**
 * Process entry point. Kept thin: everything testable lives in app.ts.
 */

const app = await buildApp();

// Drain in-flight requests before exiting so a deploy cannot cut a salary-slip
// upload in half. PM2/systemd/Docker all send SIGTERM first.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    app.log.info({ signal }, 'shutting down');
    app.close().then(
      () => process.exit(0),
      (err) => {
        app.log.error({ err }, 'error during shutdown');
        process.exit(1);
      },
    );
  });
}

try {
  await app.listen({ port: env.PORT, host: env.HOST });
} catch (err) {
  app.log.error({ err }, 'failed to start');
  process.exit(1);
}
