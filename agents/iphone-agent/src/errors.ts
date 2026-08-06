import { AthenaError } from '@athena-os/shared';

export class iPhoneAgentError extends AthenaError {
  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super(message, code, 500, details);
    this.name = 'iPhoneAgentError';
  }
}

export class DeviceSelectionError extends iPhoneAgentError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'DEVICE_SELECTION_ERROR', details);
    this.name = 'DeviceSelectionError';
  }
}

export class WDAVerificationError extends iPhoneAgentError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'WDA_VERIFICATION_ERROR', details);
    this.name = 'WDAVerificationError';
  }
}
