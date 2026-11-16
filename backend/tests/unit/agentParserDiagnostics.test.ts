import { readFile, unlink } from 'fs/promises';
import path from 'path';
import { writeAgentParserDiagnostic } from '../../src/utils/agentParserDiagnostics';

const diagnosticPath = path.resolve(__dirname, '../../logs/agent-parser-diagnostics.log');

afterEach(async () => { await unlink(diagnosticPath).catch(() => undefined); });

it('writes a sanitized parser rejection record without request content or credentials', async () => {
  await writeAgentParserDiagnostic({
    requestId: 'request-123', provider: 'gemini', model: 'test-model', httpStatus: 200,
    finishReason: 'STOP', responseStructure: 'topLevel:choices;contentType:string',
    jsonParsingSucceeded: true, extractedAction: 'unsupported_action',
    rejectionCategory: 'unsupported_action', sanitizedReason: 'Action name is not in the fixed allowlist',
  });

  const [line] = (await readFile(diagnosticPath, 'utf8')).trim().split('\n');
  const record = JSON.parse(line) as Record<string, unknown>;
  expect(record).toMatchObject({ requestId: 'request-123', provider: 'gemini', model: 'test-model', httpStatus: 200, finishReason: 'STOP', jsonParsingSucceeded: true, extractedAction: 'unsupported_action', rejectionCategory: 'unsupported_action' });
  expect(line).not.toMatch(/api[_ -]?key|jwt|authorization|employee@example\.com|full prompt/i);
});
