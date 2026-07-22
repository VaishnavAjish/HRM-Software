import winston from 'winston';
import { config } from '../config/environment';
import path from 'path';
import DailyRotateFile from 'winston-daily-rotate-file';

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let metaStr = '';
    if (Object.keys(meta).length > 0 && meta.stack) {
      metaStr = `\n${meta.stack}`;
    } else if (Object.keys(meta).length > 0) {
      metaStr = ` ${JSON.stringify(meta)}`;
    }
    return `${timestamp} [${level}]: ${message}${metaStr}`;
  })
);

const transports: winston.transport[] = [
  new winston.transports.Console({
    format: config.isDevelopment ? consoleFormat : logFormat,
    level: config.logging.level,
  }),
];

if (!config.isTest) {
  transports.push(
    new DailyRotateFile({
      filename: path.join(config.logging.dir, 'application-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      format: logFormat,
      level: 'info',
    }),
    new DailyRotateFile({
      filename: path.join(config.logging.dir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d',
      format: logFormat,
      level: 'error',
    }),
    new DailyRotateFile({
      filename: path.join(config.logging.dir, 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      format: logFormat,
    })
  );
}

export const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  defaultMeta: { service: 'hrflow-pro' },
  transports,
  exitOnError: false,
});

export const createModuleLogger = (module: string) => {
  return logger.child({ module });
};

export default logger;