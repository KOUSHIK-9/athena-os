import pino from 'pino';
import pretty from 'pino-pretty';

const isDevelopment = process.env.NODE_ENV !== 'production';

function createLoggerInstance(name: string, options?: pino.LoggerOptions): pino.Logger {
  const stream =
    process.env.ATHENA_LOG_STREAM === 'stderr' ? process.stderr : process.stdout;

  const baseOptions: pino.LoggerOptions = {
    name,
    level: process.env.LOG_LEVEL ?? (isDevelopment ? 'debug' : 'info'),
    redact: {
      paths: ['*.password', '*.token', '*.secret', '*.key', '*.authorization'],
      censor: '[REDACTED]',
    },
    ...options,
  };

  if (isDevelopment) {
    const prettyStream = pretty({
      destination: stream,
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
      singleLine: false,
    });
    return pino(baseOptions, prettyStream);
  }

  return pino(baseOptions, stream);
}

export const logger = createLoggerInstance('athena-os');

export function createLogger(name: string): pino.Logger {
  return logger.child({ component: name });
}

export function setLogLevel(level: pino.LevelWithSilent | string): void {
  logger.level = level;
}

export { pino };
