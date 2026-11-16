import { safeFailureDiagnostics } from '../../src/utils/safeFailureDiagnostics';

it('includes safe stage, error class and database code without copying sensitive messages', () => {
  const error = Object.assign(new Error('token=super-secret user@example.com'), { name: 'MongoServerError', code: 11000 });
  const diagnostic = safeFailureDiagnostics('persist_reminder_delivery_status', error);

  expect(diagnostic).toEqual({ stage: 'persist_reminder_delivery_status', errorType: 'MongoServerError', databaseErrorCode: 11000 });
  expect(JSON.stringify(diagnostic)).not.toContain('super-secret');
  expect(JSON.stringify(diagnostic)).not.toContain('user@example.com');
});

it('keeps only valid provider status and safe provider error codes', () => {
  const error = Object.assign(new Error('private payload'), { status: 422, providerErrorCode: 'sender_invalid' });
  expect(safeFailureDiagnostics('send_provider_request', error)).toEqual({
    stage: 'send_provider_request', errorType: 'Error', providerStatus: 422, providerErrorCode: 'sender_invalid',
  });
  expect(safeFailureDiagnostics('send_provider_request', Object.assign(new Error('x'), { status: 200, providerErrorCode: 'sender@example.com' }))).toEqual({
    stage: 'send_provider_request', errorType: 'Error',
  });
});

it('uses a fixed error class when an error name is not a safe identifier', () => {
  const error = Object.assign(new Error('sensitive'), { name: 'bad@example.com API key', code: 11000 });
  expect(safeFailureDiagnostics('claim_reminder_deduplication', error)).toEqual({ stage: 'claim_reminder_deduplication', errorType: 'UnknownError' });
});
