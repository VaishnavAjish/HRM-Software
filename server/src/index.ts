import { createServer, Server } from 'http';
import app from './app';
import { config } from './config/environment';
import { connectDatabase, disconnectDatabase, isConnected, getConnectionStatus } from './config/database';

let server: Server | null = null;

const logStartupInfo = (): void => {
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                          HRFlow Pro API Server                              ║');
  console.log('╠══════════════════════════════════════════════════════════════════════════════╣');
  console.log(`║  Environment: ${config.env.padEnd(60)}║`);
  console.log(`║  Server:      http://${config.host}:${config.port}${config.apiPrefix}`.padEnd(77) + '║');
  console.log(`║  MongoDB:     ${getConnectionStatus().padEnd(65)}║`);
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
};

const handleUncaughtException = (error: Error): void => {
  console.error('❌ Uncaught Exception:', error);
  console.error(error.stack);
  gracefulShutdown('uncaughtException');
};

const handleUnhandledRejection = (reason: unknown, promise: Promise<unknown>): void => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
};

const gracefulShutdown = async (signal: string): Promise<void> => {
  const signalName = signal === 'uncaughtException' ? 'SIGUNCAUGHT' : signal;
  console.log(`\n⚠️  Received ${signalName}. Starting graceful shutdown...`);

  if (server) {
    server.close(async () => {
      console.log('🔌 HTTP server closed');
      await disconnectDatabase();
      console.log('✅ Graceful shutdown complete');
      process.exit(signal === 'uncaughtException' || signal === 'unhandledRejection' ? 1 : 0);
    });

    setTimeout(() => {
      console.error('❌ Forced shutdown after 10s timeout');
      process.exit(1);
    }, 10000);
  } else {
    await disconnectDatabase();
    process.exit(signal === 'uncaughtException' || signal === 'unhandledRejection' ? 1 : 0);
  }
};

const startServer = async (): Promise<Server> => {
  try {
    await connectDatabase();
    console.log(`✅ MongoDB connected: ${getConnectionStatus()}`);

    server = createServer(app);

    server.listen(config.port, config.host, () => {
      logStartupInfo();
    });

    server.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${config.port} is already in use`);
      } else {
        console.error('❌ Server error:', error);
      }
      process.exit(1);
    });

    return server;
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

process.on('uncaughtException', handleUncaughtException);
process.on('unhandledRejection', handleUnhandledRejection);
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

if (require.main === module) {
  startServer();
}

export { startServer, server, gracefulShutdown };
export default server;