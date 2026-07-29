import 'dotenv/config';
import app from './app';

const PORT = Number(process.env.PORT) || 5000;

// On Windows the dual-stack bind can succeed on IPv4 and then fail on IPv6, so
// the success message is deferred until we know no 'error' event followed it.
let failed = false;

const server = app.listen(PORT, () => {
  setImmediate(() => {
    if (!failed) console.log(`Enterprise RBAC server is running on port ${PORT}`);
  });
});

// Without this, an EADDRINUSE emits an unhandled 'error' event, the listening
// handle closes, the event loop empties and the process exits with code 0 —
// looking like the server "stopped by itself" with no message.
server.on('error', (err: NodeJS.ErrnoException) => {
  failed = true;
  if (err.code === 'EADDRINUSE') {
    console.error(
      `\nPort ${PORT} is already in use — another server is still running.\n` +
        `Find it:  netstat -ano | findstr :${PORT}\n` +
        `Stop it:  taskkill /PID <pid> /F\n` +
        `Or run on another port:  set PORT=5001 && npm run dev\n`
    );
  } else {
    console.error('Server failed to start:', err);
  }
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  process.exit(1);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log(`\n${signal} received, shutting down.`);
    server.close(() => process.exit(0));
  });
}
