# FleetGraph Agent — Architecture Diagram

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              SHIP WEB (React + Vite)                            │
│                                                                                 │
│  ┌──────────────────┐  ┌──────────────────────┐  ┌──────────────────────────┐   │
│  │ WeekOverviewTab   │  │ UnifiedDocumentPage  │  │    Programs Page        │   │
│  │                   │  │                      │  │                          │   │
│  │ ┌───────────────┐ │  │ ┌──────────────────┐ │  │ ┌──────────────────────┐ │   │
│  │ │FleetGraph     │ │  │ │FleetGraph        │ │  │ │FleetGraph            │ │   │
│  │ │WeekPanel      │ │  │ │AssistantPanel    │ │  │ │PortfolioSummary      │ │   │
│  │ │               │ │  │ │                  │ │  │ │                      │ │   │
│  │ │• Risk findings│ │  │ │• "Get Guidance"  │ │  │ │• Program cards       │ │   │
│  │ │• Severity     │ │  │ │• "Draft Standup" │ │  │ │• on_track / at_risk  │ │   │
│  │ │  badges       │ │  │ │• Recommendations │ │  │ │  / stalled           │ │   │
│  │ │• Evidence     │ │  │ │• Draft preview   │ │  │ │• Blocker counts      │ │   │
│  │ │• HITL approve │ │  │ │                  │ │  │ │• Silent days         │ │   │
│  │ │  / reject     │ │  │ │ (issue + person  │ │  │ │                      │ │   │
│  │ └───────────────┘ │  │ │  views)          │ │  │ └──────────────────────┘ │   │
│  └────────┬──────────┘  │ └────────┬─────────┘ │  └───────────┬──────────────┘   │
│           │             └──────────┼───────────┘              │                  │
│  ┌────────┴────────┐   ┌──────────┴──────────┐   ┌───────────┴─────────────┐    │
│  │useFleetGraph    │   │useFleetGraph        │   │useFleetGraph            │    │
│  │WeekQuery        │   │Guidance             │   │PortfolioQuery           │    │
│  │                 │   │                     │   │                         │    │
│  │• useWeekFindings│   │• useContextual      │   │• usePortfolio           │    │
│  │  Query          │   │  Guidance           │   │  Summary                │    │
│  │• useConfirm     │   │• useGenerate        │   │                         │    │
│  │  Recommendation │   │  Draft              │   │                         │    │
│  └────────┬────────┘   └──────────┬──────────┘   └───────────┬─────────────┘    │
└───────────┼────────────────────────┼──────────────────────────┼──────────────────┘
            │                        │                          │
            │  HTTP POST             │  HTTP POST               │  HTTP POST
            │  + Bearer auth         │  + Bearer auth           │  + Bearer auth
            ▼                        ▼                          ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           SHIP API (Express)                                    │
│                                                                                 │
│  app.use('/api/agent', conditionalCsrf, fleetgraphRoutes)                      │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                    fleetgraph.ts Router                                  │    │
│  │                                                                         │    │
│  │  ┌─────────────────┐   Rate Limiter: 20 req/min/user                   │    │
│  │  │ GET /status      │   authMiddleware on all routes                    │    │
│  │  └─────────────────┘   Zod validation on all POST bodies               │    │
│  │                                                                         │    │
│  │  ┌───────────────────────────┐  ┌────────────────────────────────────┐  │    │
│  │  │ POST /proactive-findings  │  │ POST /contextual-guidance          │  │    │
│  │  │                           │  │                                    │  │    │
│  │  │ → runProactiveFindingsScan│  │ → generateContextualGuidance       │  │    │
│  │  └─────────────┬─────────────┘  └──────────────────┬─────────────────┘  │    │
│  │                │                                    │                    │    │
│  │  ┌─────────────┴─────────────┐  ┌──────────────────┴─────────────────┐  │    │
│  │  │ POST /drafts              │  │ POST /portfolio-summary            │  │    │
│  │  │                           │  │                                    │  │    │
│  │  │ → generateDraft           │  │ → generatePortfolioSummary         │  │    │
│  │  └───────────────────────────┘  └────────────────────────────────────┘  │    │
│  │                                                                         │    │
│  │  ┌───────────────────────────────────────────┐                          │    │
│  │  │ POST /recommendations/:id/confirm         │                          │    │
│  │  │                                           │                          │    │
│  │  │ → HITL approval gate (approve / reject)   │                          │    │
│  │  └───────────────────────────────────────────┘                          │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                        SERVICE LAYER                                    │    │
│  │                                                                         │    │
│  │  ┌─────────────────────┐  ┌────────────────────┐  ┌─────────────────┐  │    │
│  │  │ proactive-findings  │  │ contextual-guidance │  │ portfolio-      │  │    │
│  │  │ .ts                 │  │ .ts                 │  │ summary.ts      │  │    │
│  │  │                     │  │                     │  │                 │  │    │
│  │  │ runProactiveFindings│  │ generateContextual  │  │ generatePortfo- │  │    │
│  │  │ Scan()              │  │ Guidance()          │  │ lioSummary()    │  │    │
│  │  │                     │  │                     │  │                 │  │    │
│  │  │ • scanWeekScope()   │  │ • Issue guidance    │  │ • assessProgram │  │    │
│  │  │ • scanWorkspace     │  │ • Week guidance     │  │   Health()      │  │    │
│  │  │   Scope()           │  │ • Person guidance   │  │ • on_track /    │  │    │
│  │  │ • shapeRecommend-   │  │ • rankNextWork()    │  │   at_risk /     │  │    │
│  │  │   ations()          │  │                     │  │   stalled       │  │    │
│  │  │                     │  │ generateDraft()     │  │ • Sort by       │  │    │
│  │  │                     │  │ • standup           │  │   severity      │  │    │
│  │  │                     │  │ • weekly_plan       │  │                 │  │    │
│  │  └─────────┬───────────┘  └──────────┬─────────┘  └────────┬────────┘  │    │
│  │            │                          │                     │           │    │
│  └────────────┼──────────────────────────┼─────────────────────┼───────────┘    │
│               │                          │                     │                │
│  ┌────────────┴──────────────────────────┴─────────────────────┴───────────┐    │
│  │                        DETECTORS                                        │    │
│  │                                                                         │    │
│  │  week-risk.ts                                                           │    │
│  │  ┌──────────────┐ ┌──────────────┐ ┌───────────────┐ ┌──────────────┐  │    │
│  │  │ detect       │ │ detect       │ │ detect        │ │ detect       │  │    │
│  │  │ Blockers()   │ │ StaleWork()  │ │ SlippingScope │ │ MissingPlan  │  │    │
│  │  │              │ │              │ │ ()            │ │ Approval()   │  │    │
│  │  │ >6d stale    │ │ 3-6d stale   │ │ >50% not     │ │ Active week  │  │    │
│  │  │ in_progress  │ │ in_progress  │ │ started       │ │ no approval  │  │    │
│  │  │ → critical   │ │ → medium/high│ │ → high/crit   │ │ → high       │  │    │
│  │  └──────────────┘ └──────────────┘ └───────────────┘ └──────────────┘  │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                      DATA ACCESS LAYER                                  │    │
│  │                                                                         │    │
│  │  ShipAPIClient (REST only — no direct DB access)                        │    │
│  │                                                                         │    │
│  │  Documents │ Issues │ Weeks │ Programs │ Projects │ Team │ Activity     │    │
│  │                                                                         │    │
│  │  Every call goes through Ship's own REST API endpoints                  │    │
│  │  → /api/documents, /api/issues, /api/weeks, /api/programs, etc.         │    │
│  └───────────────────────────────────┬─────────────────────────────────────┘    │
│                                      │                                          │
│                                      │ HTTP (localhost)                         │
│                                      ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │  Existing Ship REST API (documents, issues, weeks, programs, etc.)      │    │
│  │  → PostgreSQL                                                           │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────────┐
│                      LANGGRAPH WORKFLOW ENGINE                                  │
│                                                                                 │
│  buildFleetGraph(nodes) → compiled StateGraph                                  │
│                                                                                 │
│  ┌─────────┐    ┌─────────┐    ┌───────────┐    ┌──────────┐    ┌───────────┐ │
│  │         │    │         │    │           │    │          │    │           │ │
│  │ CONTEXT │───▶│  FETCH  │───▶│ REASONING │───▶│  ACTION  │───▶│    END    │ │
│  │  node   │    │  node   │    │   node    │    │   node   │    │           │ │
│  │         │    │         │    │           │    │          │    │           │ │
│  └─────────┘    └─────────┘    └───────────┘    └────┬─────┘    └───────────┘ │
│                                                      │ errors?                 │
│                                                      ▼                         │
│                                                ┌───────────┐                   │
│                                                │ FALLBACK  │                   │
│                                                │   node    │──────▶ END        │
│                                                │           │                   │
│                                                └───────────┘                   │
│                                                                                 │
│  State Annotation (accumulated across nodes):                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  invocation        │ InvocationContext (trigger, view, scope)           │   │
│  │  contextSummary    │ string (overwrite reducer)                        │   │
│  │  fetchedResources  │ ShipDocument[] (overwrite reducer)                │   │
│  │  detectedFindings  │ FleetGraphFinding[] (accumulate reducer)          │   │
│  │  recommendedActions│ FleetGraphRecommendation[] (accumulate reducer)   │   │
│  │  draftOutputs      │ FleetGraphDraft[] (accumulate reducer)            │   │
│  │  approvalRequire-  │ ApprovalGate[] (accumulate reducer)               │   │
│  │   ments            │                                                   │   │
│  │  errors            │ string[] (accumulate reducer)                     │   │
│  │  fallback          │ FleetGraphFallback | undefined                    │   │
│  │  userPrompt        │ string | undefined                                │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  Node Implementations:                                                         │
│  ┌───────────────────────┐ ┌──────────────────────┐ ┌─────────────────────┐   │
│  │ week-context.ts       │ │ guidance-context.ts   │ │ portfolio-context.ts│   │
│  │                       │ │                       │ │                     │   │
│  │ • weekContextNode()   │ │ • guidanceContextNode │ │ • portfolioContext  │   │
│  │ • weekFetchNode()     │ │   ()                  │ │   Node()            │   │
│  │                       │ │ • guidanceFetchNode() │ │ • portfolioFetch    │   │
│  │                       │ │                       │ │   Node()            │   │
│  └───────────────────────┘ └──────────────────────┘ └─────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────────┐
│                         OBSERVABILITY                                           │
│                                                                                 │
│  ┌──────────────────────┐  ┌─────────────────────┐  ┌───────────────────────┐  │
│  │  LangSmith Tracing   │  │ observability.ts     │  │ OpenAPI / Swagger     │  │
│  │                      │  │                      │  │                       │  │
│  │  • Auto-traces via   │  │ • logFleetGraph()    │  │ • Zod schemas with    │  │
│  │    LANGCHAIN_TRACING │  │ • withTiming()       │  │   .openapi()          │  │
│  │  • Runtime config    │  │ • logFallback()      │  │ • 5 paths registered  │  │
│  │    in runtime.ts     │  │ • Structured logging │  │ • Auto-generated docs │  │
│  └──────────────────────┘  └─────────────────────┘  └───────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Data Flow: User Story 1 — Sprint Risk Detection

```
User opens Week view
        │
        ▼
WeekOverviewTab renders FleetGraphWeekPanel
        │
        ▼
useWeekFindingsQuery() fires
        │
        ▼
POST /api/agent/proactive-findings
  { workspaceId, scopeType: "week", scopeId: weekId }
        │
        ▼
runProactiveFindingsScan()
        │
        ├──▶ ShipAPIClient.getWeek(weekId)
        ├──▶ ShipAPIClient.getWeekIssues(weekId)
        │
        ▼
runWeekRiskDetectors(issues, week)
        │
        ├──▶ detectBlockers()        → critical findings
        ├──▶ detectStaleWork()       → medium/high findings
        ├──▶ detectSlippingScope()   → high/critical findings
        ├──▶ detectMissingPlanApproval() → high findings
        │
        ▼
Sort by severity, return to UI
        │
        ▼
FleetGraphWeekPanel renders findings with:
  • Severity badges (critical/high/medium/low)
  • Expandable rationale + evidence
  • "Approve" / "Reject" buttons for HITL actions
        │
        ▼ (user clicks Approve)
POST /api/agent/recommendations/:id/confirm
  { decision: "approve" }
```

## Data Flow: User Story 2 — Contextual Guidance

```
User opens Issue / Person view
        │
        ▼
UnifiedDocumentPage renders FleetGraphAssistantPanel
        │
        ├──▶ User clicks "Get Guidance"
        │           │
        │           ▼
        │    POST /api/agent/contextual-guidance
        │      { workspaceId, viewType, documentId }
        │           │
        │           ▼
        │    generateContextualGuidance()
        │      ├── issue view  → detectStaleWork, show status
        │      ├── week view   → show progress (done/total)
        │      └── person view → rankNextWork(), top 3 recommendations
        │
        └──▶ User clicks "Draft Standup"
                    │
                    ▼
             POST /api/agent/drafts
               { workspaceId, draftType: "standup", sourceContext }
                    │
                    ▼
             generateDraft()
               └── Fetches assigned issues
                   Groups by state: Done / In Progress / Blockers
                   Returns markdown draft body
```

## Data Flow: User Story 3 — Portfolio Summary

```
User opens Programs page (programs.length > 0)
        │
        ▼
FleetGraphPortfolioSummary auto-fetches on mount
        │
        ▼
POST /api/agent/portfolio-summary
  { workspaceId, programIds? }
        │
        ▼
generatePortfolioSummary()
        │
        ├──▶ ShipAPIClient.listPrograms()
        ├──▶ ShipAPIClient.listIssues()
        │
        ▼
For each program → assessProgramHealth()
        │
        ├── on_track:  normal activity, few blockers
        ├── at_risk:   stalled issues (>6d), blocker ratio high
        └── stalled:   no activity for >7 days, no issues
        │
        ▼
Sort: stalled → at_risk → on_track
        │
        ▼
FleetGraphPortfolioSummary renders:
  • Summary line: "3 on track, 1 at risk, 1 stalled"
  • Program cards with status indicator dots
  • Blocker counts and silent-day metrics
```

## Key Architectural Decisions


| Decision                                    | Rationale                                                                                        |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| REST-only data access via ShipAPIClient     | Agent never queries PostgreSQL directly; uses existing auth/access control                       |
| HITL approval gate at route level           | HTTP request/response cycle incompatible with in-graph blocking; approval is a separate endpoint |
| LangGraph StateGraph with typed annotations | Accumulate-reducer pattern for findings/recommendations; overwrite-reducer for context           |
| Detectors as pure functions                 | Testable, composable risk detection with configurable thresholds                                 |
| Bearer auth for CSRF bypass                 | Agent API calls use API tokens, not session cookies                                              |
| Rate limiting at 20 req/min                 | Prevents abuse without blocking normal interactive use                                           |
| Fallback on all service errors              | Never surfaces raw errors to users; always returns valid response shape                          |


