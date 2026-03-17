/**
 * FleetGraph agent route handlers.
 *
 * POST /api/agent/contextual-guidance  - On-demand guidance for current view
 * POST /api/agent/proactive-findings   - Proactive risk scan
 * POST /api/agent/drafts               - Generate automated draft
 * POST /api/agent/chat                 - Multi-turn conversational chat
 * POST /api/agent/actions/:id/decide   - Approve/dismiss/snooze action
 * GET  /api/agent/actions              - List pending actions
 * POST /api/agent/check-blockers       - Blocker escalation check
 * POST /api/agent/expire-actions       - Expire stale actions
 * POST /api/agent/portfolio-summary    - Portfolio drift summary
 * GET  /api/agent/status               - Check if FleetGraph is available
 */

import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { authMiddleware } from '../middleware/auth.js';
import { isFleetGraphAvailable } from '../fleet/runtime.js';
import { runProactiveFindingsScan } from '../fleet/services/proactive-findings.js';
import { generateContextualGuidance, generateDraft } from '../fleet/services/contextual-guidance.js';
import { generatePortfolioSummary } from '../fleet/services/portfolio-summary.js';
import { handleChat } from '../fleet/services/chat-service.js';
import { createActionService } from '../fleet/services/action-service.js';
import { runBlockerCheck } from '../fleet/services/blocker-check.js';
import {
  ContextualGuidanceRequestSchema,
  ProactiveFindingsRequestSchema,
  CreateDraftRequestSchema,
  PortfolioSummaryRequestSchema,
  ChatRequestSchema,
  ActionDecideRequestSchema,
  CheckBlockersRequestSchema,
  ExpireActionsRequestSchema,
} from '../openapi/schemas/fleetgraph.js';

type RouterType = ReturnType<typeof Router>;
const router: RouterType = Router();

// FleetGraph-specific rate limiting (20 requests per minute per user)
const isTestEnv = process.env.NODE_ENV === 'test' || process.env.E2E_TEST === '1';
const fleetgraphLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isTestEnv ? 10000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many FleetGraph requests. Please slow down.' },
});

router.use(fleetgraphLimiter);

// GET /api/agent/status
router.get('/status', authMiddleware, (_req: Request, res: Response) => {
  res.json({ available: isFleetGraphAvailable() });
});

// POST /api/agent/contextual-guidance
router.post('/contextual-guidance', authMiddleware, async (req: Request, res: Response) => {
  try {
    const parsed = ContextualGuidanceRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
      return;
    }

    const result = await generateContextualGuidance(parsed.data);
    res.json(result);
  } catch (err) {
    console.error('FleetGraph contextual-guidance error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/agent/proactive-findings
router.post('/proactive-findings', authMiddleware, async (req: Request, res: Response) => {
  try {
    const parsed = ProactiveFindingsRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
      return;
    }

    const result = await runProactiveFindingsScan(parsed.data);
    res.json(result);
  } catch (err) {
    console.error('FleetGraph proactive-findings error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/agent/drafts
router.post('/drafts', authMiddleware, async (req: Request, res: Response) => {
  try {
    const parsed = CreateDraftRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
      return;
    }

    const result = await generateDraft(parsed.data);
    res.json(result);
  } catch (err) {
    console.error('FleetGraph drafts error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/agent/chat
router.post('/chat', authMiddleware, async (req: Request, res: Response) => {
  try {
    const parsed = ChatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      console.error('FleetGraph chat validation error:', parsed.error.flatten());
      res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
      return;
    }

    console.log('[FleetGraph] Chat request:', { viewType: parsed.data.viewType, documentId: parsed.data.documentId, messageCount: parsed.data.messages.length });
    const result = await handleChat(parsed.data);
    console.log('[FleetGraph] Chat result:', { degradationTier: result.degradationTier, messageLen: result.message.length });
    res.json(result);
  } catch (err) {
    console.error('FleetGraph chat error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/agent/actions/:actionId/decide
router.post('/actions/:actionId/decide', authMiddleware, async (req: Request, res: Response) => {
  try {
    const parsed = ActionDecideRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
      return;
    }

    const actionId = req.params.actionId as string;
    const userId = (req as any).user?.id as string | undefined;
    const actionService = createActionService();
    const result = await actionService.decideAction(actionId, parsed.data as any, userId);
    res.json(result);
  } catch (err) {
    console.error('FleetGraph action decide error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/agent/actions
router.get('/actions', authMiddleware, async (req: Request, res: Response) => {
  try {
    const workspaceId = req.query.workspaceId as string;
    const status = (req.query.status as string) ?? 'pending';

    if (!workspaceId) {
      res.status(400).json({ error: 'workspaceId query parameter is required' });
      return;
    }

    const actionService = createActionService();
    const actions = await actionService.listActions(workspaceId, status);
    res.json({ actions });
  } catch (err) {
    console.error('FleetGraph actions list error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/agent/check-blockers
router.post('/check-blockers', authMiddleware, async (req: Request, res: Response) => {
  try {
    const parsed = CheckBlockersRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
      return;
    }

    const result = await runBlockerCheck(parsed.data);
    res.json(result);
  } catch (err) {
    console.error('FleetGraph check-blockers error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/agent/expire-actions
router.post('/expire-actions', authMiddleware, async (req: Request, res: Response) => {
  try {
    const parsed = ExpireActionsRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
      return;
    }

    const actionService = createActionService();
    const expired = await actionService.expireStaleActions(parsed.data.workspaceId);
    res.json({ expired });
  } catch (err) {
    console.error('FleetGraph expire-actions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/agent/portfolio-summary
router.post('/portfolio-summary', authMiddleware, async (req: Request, res: Response) => {
  try {
    const parsed = PortfolioSummaryRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
      return;
    }

    const result = await generatePortfolioSummary(parsed.data);
    res.json(result);
  } catch (err) {
    console.error('FleetGraph portfolio-summary error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
