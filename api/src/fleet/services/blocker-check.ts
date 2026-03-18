/**
 * Deprecated compatibility wrapper.
 */

import type { CheckBlockersRequest, CheckBlockersResponse } from '@ship/shared';

export async function runBlockerCheck(
  _request: CheckBlockersRequest,
): Promise<CheckBlockersResponse> {
  return { findings: [], escalated: 0, skipped: 0 };
}
