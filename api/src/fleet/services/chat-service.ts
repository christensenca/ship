/**
 * Deprecated compatibility wrapper around the unified agent invocation path.
 */

import type { ChatRequest, ChatResponse } from '@ship/shared';
import { invokeChatAgent } from './invoke-agent.js';

export async function handleChat(request: ChatRequest, userId?: string): Promise<ChatResponse> {
  const result = await invokeChatAgent(request, userId);
  return {
    ...result,
    message: result.summary,
    refetchedScope: true,
  };
}
