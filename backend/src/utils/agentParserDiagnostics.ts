import { appendFile, mkdir } from 'fs/promises';
import path from 'path';

export interface AgentParserDiagnostic {
  requestId: string;
  provider: string;
  model: string;
  httpStatus: number | null;
  finishReason: string | null;
  responseStructure: string;
  jsonParsingSucceeded: boolean;
  extractedAction: string | null;
  rejectionCategory: 'malformed_json' | 'unsupported_action' | 'invalid_plan_shape' | 'missing_required_fields' | 'unexpected_response_structure' | null;
  sanitizedReason: string | null;
}

const logPath = path.resolve(__dirname, '../../logs/agent-parser-diagnostics.log');
const safeToken = (value: string | null, max = 100): string | null => {
  if (value === null) return null;
  return value.replace(/[^a-zA-Z0-9_.:/ -]/g, '').slice(0, max) || null;
};

/** Writes only fixed, non-content diagnostic fields. Failure must never interrupt an agent request. */
export async function writeAgentParserDiagnostic(input: AgentParserDiagnostic): Promise<void> {
  try {
    const entry: AgentParserDiagnostic & { timestamp: string } = {
      requestId: safeToken(input.requestId, 80) ?? 'unknown',
      timestamp: new Date().toISOString(),
      provider: safeToken(input.provider) ?? 'unknown',
      model: safeToken(input.model) ?? 'unknown',
      httpStatus: Number.isInteger(input.httpStatus) ? input.httpStatus : null,
      finishReason: safeToken(input.finishReason),
      responseStructure: safeToken(input.responseStructure, 160) ?? 'unknown',
      jsonParsingSucceeded: input.jsonParsingSucceeded,
      extractedAction: safeToken(input.extractedAction),
      rejectionCategory: input.rejectionCategory,
      sanitizedReason: safeToken(input.sanitizedReason, 160),
    };
    await mkdir(path.dirname(logPath), { recursive: true });
    await appendFile(logPath, `${JSON.stringify(entry)}\n`, { encoding: 'utf8', mode: 0o600 });
  } catch {
    // Diagnostics are best effort and must not alter workflow success or failure.
  }
}
