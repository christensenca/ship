/**
 * FleetGraph agent route handlers.
 *
 * POST /api/agent/contextual-guidance  - On-demand guidance for current view
 * POST /api/agent/proactive-findings   - Proactive risk scan
 * POST /api/agent/drafts               - Generate automated draft
 * POST /api/agent/recommendations/:id/confirm - Approve/reject recommendation
 * POST /api/agent/portfolio-summary    - Portfolio drift summary
 * GET  /api/agent/status               - Check if FleetGraph is available
 */

import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { authMiddleware } from '../middleware/auth.js';
import { isFleetGraphAvailable } from '../fleet/runtime.js';
import { runProactiveFindingsScan, shapeRecommendations } from '../fleet/services/proactive-findings.js';
import { generateContextualGuidance, generateDraft } from '../fleet/services/contextual-guidance.js';
import { generatePortfolioSummary } from '../fleet/services/portfolio-summary.js';
import {
  ContextualGuidanceRequestSchema,
  ProactiveFindingsRequestSchema,
  CreateDraftRequestSchema,
  RecommendationDecisionRequestSchema,
  PortfolioSummaryRequestSchema,
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

// POST /api/agent/recommendations/:recommendationId/confirm
router.post('/recommendations/:recommendationId/confirm', authMiddleware, async (req: Request, res: Response) => {
  try {
    const parsed = RecommendationDecisionRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
      return;
    }

    const { recommendationId } = req.params;

    // Placeholder: will be implemented in T019
    res.json({
      recommendationId,
      status: parsed.data.decision === 'approve' ? 'approved' : 'rejected',
    });
  } catch (err) {
    console.error('FleetGraph recommendation confirm error:', err);
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
