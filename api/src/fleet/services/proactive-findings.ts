import type { ProactiveFindingsRequest, ProactiveFindingsResponse } from '@ship/shared';
import { invokeProactiveAgent } from './invoke-agent.js';

export async function runProactiveFindingsScan(
  request: ProactiveFindingsRequest,
): Promise<ProactiveFindingsResponse> {
  return invokeProactiveAgent(request);
}
