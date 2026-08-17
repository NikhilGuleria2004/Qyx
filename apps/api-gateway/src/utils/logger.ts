export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEnvelope {
  level: LogLevel;
  service: string;
  request_id: string;
  organization_id?: string;
  user_id?: string;
  message: string;
  timestamp: number;
  [key: string]: unknown;
}

const SERVICE = 'api-gateway';

function buildEnvelope(level: LogLevel, message: string, requestId: string, extra?: Record<string, unknown>): LogEnvelope {
  const envelope: LogEnvelope = {
    level,
    service: SERVICE,
    request_id: requestId,
    message,
    timestamp: Date.now(),
  };

  if (extra) {
    Object.assign(envelope, extra);
  }

  return envelope;
}

export function createLogger(requestId: string) {
  const log = (level: LogLevel, message: string, extra?: Record<string, unknown>) => {
    const envelope = buildEnvelope(level, message, requestId, extra);
    const json = JSON.stringify(envelope);

    switch (level) {
      case 'error':
        console.error(json); // eslint-disable-line no-console
        break;
      case 'warn':
        console.warn(json); // eslint-disable-line no-console
        break;
      default:
        console.log(json); // eslint-disable-line no-console
    }
  };

  return {
    debug: (message: string, extra?: Record<string, unknown>) => log('debug', message, extra),
    info: (message: string, extra?: Record<string, unknown>) => log('info', message, extra),
    warn: (message: string, extra?: Record<string, unknown>) => log('warn', message, extra),
    error: (message: string, extra?: Record<string, unknown>) => log('error', message, extra),
  };
}
