/** Build log metadata from an error without ever including its message or payload. */
export function safeFailureDiagnostics(stage: string, error: unknown): Record<string, string | number> {
  const name = error instanceof Error ? error.name : 'UnknownError';
  const errorType = /^[A-Za-z][A-Za-z0-9_.]{0,63}$/.test(name) ? name : 'UnknownError';
  const context: Record<string, string | number> = { stage, errorType };
  if (!error || typeof error !== 'object') return context;

  const value = error as Record<string, unknown>;
  const isDatabaseError = /mongo|mongoose|cast|validation/i.test(errorType);
  const databaseCode = value.code;
  if (isDatabaseError && typeof databaseCode === 'number' && Number.isInteger(databaseCode)) {
    context.databaseErrorCode = databaseCode;
  } else if (isDatabaseError && typeof databaseCode === 'string' && /^[A-Z][A-Z0-9_]{1,39}$/.test(databaseCode)) {
    context.databaseErrorCode = databaseCode;
  }

  const status = value.status;
  if (typeof status === 'number' && Number.isInteger(status) && status >= 400 && status <= 599) {
    context.providerStatus = status;
  }
  const providerCode = value.providerErrorCode;
  if (typeof providerCode === 'string' && /^[A-Za-z0-9_.-]{1,64}$/.test(providerCode)) {
    context.providerErrorCode = providerCode;
  }

  const operationalStatus = value.statusCode;
  if (typeof operationalStatus === 'number' && Number.isInteger(operationalStatus) && operationalStatus >= 400 && operationalStatus <= 599) {
    context.operationalStatus = operationalStatus;
  }
  return context;
}
