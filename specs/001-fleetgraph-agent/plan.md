# Implementation Plan: FleetGraph Agent

**Branch**: `001-fleetgraph-agent` | **Date**: 2026-03-16 | **Spec**: [spec.md](/Users/cadechristensen/Source/ship/specs/001-fleetgraph-agent/spec.md)
**Input**: Feature specification from `/specs/001-fleetgraph-agent/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Deliver a FleetGraph agent that proactively surfaces plan-versus-reality risk, provides contextual on-demand guidance, and prepares human-reviewable drafts using a LangGraph workflow in the existing Ship monorepo. The implementation will use Ship REST APIs as the only runtime data source, keep persisted outputs inside the unified document model, and require explicit human approval for any state-changing recommendation.

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: TypeScript 5.7.x on Node.js 20+  
**Primary Dependencies**: Express, React, Zod/OpenAPI tooling, LangGraph/LangChain JS, LangSmith  
**Storage**: Existing Ship PostgreSQL-backed document model accessed through Ship REST APIs only; persisted agent outputs stored as document-backed content  
**Testing**: Vitest, Supertest, React Testing Library, Playwright for end-to-end validation where needed  
**Target Platform**: Existing Ship web application and Node-based API service  
**Project Type**: Monorepo web application with Express API and React frontend  
**Performance Goals**: On-demand guidance should return an actionable response within 5 seconds for a single view; proactive scans should complete within 30 seconds for a typical active-week scope  
**Constraints**: No direct database access from the agent runtime; every mutation path requires a human-in-the-loop gate; all new routes require OpenAPI registration; document authoring must reuse the shared Editor and four-panel layout  
**Scale/Scope**: Designed for workspaces spanning roughly 100 to 1,000 projects, including active week scans, individual guidance requests, and recurring portfolio summaries

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Everything Is a Document**: Pass. Persisted drafts, summaries, and insights will be represented as document-backed content rather than new content tables.
- **II. Shared Editor and Four-Panel Layout**: Pass. Any persisted draft or summary that opens for editing will reuse the shared Editor experience; no separate editor is planned.
- **III. Boring Technology First**: Pass with justification. LangGraph and LangSmith are new dependencies, but they are directly justified by the required graph workflow, approval gates, and execution tracing. A custom orchestration layer was considered and rejected as more complex.
- **IV. Contracted APIs with OpenAPI**: Pass. The plan introduces dedicated agent routes and includes a contract artifact that must map to OpenAPI registration during implementation.
- **V. Explicit Schema Evolution**: Pass. The initial design assumes no schema change. If implementation proves a schema change is required, it must be delivered by numbered SQL migration only.
- **VI. Untitled Means Untitled**: Pass. Any new persisted document created by the agent must start as `Untitled`.
- **VII. Behavior Changes Require Verification**: Pass. The plan includes explicit verification paths for guidance, proactive findings, approval gates, and persisted drafts.

## Project Structure

### Documentation (this feature)

```text
specs/001-fleetgraph-agent/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
api/
├── src/
│   ├── routes/                # Agent endpoints, OpenAPI registration, request validation
│   ├── services/              # FleetGraph application services and API orchestration
│   ├── lib/                   # LangGraph node helpers, tracing, fallback helpers
│   ├── middleware/            # Existing auth/session enforcement reused by agent routes
│   └── db/                    # Existing migrations only if later required
├── tests/                     # API integration and contract coverage
└── package.json

web/
├── src/
│   ├── pages/                 # Existing issue/week/project/program/person entry points
│   ├── components/            # Agent panels, approval prompts, draft entry points
│   ├── hooks/                 # Queries and mutations for agent endpoints
│   └── lib/                   # View-context helpers where needed
└── package.json

shared/
├── types/                     # Shared FleetGraph request/response and domain types
└── constants/                 # Shared enums or labels if needed

specs/001-fleetgraph-agent/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
```

**Structure Decision**: Use the existing Ship monorepo split. Agent orchestration and route handling live in `api/`, context entry points and approval UX live in `web/`, and shared request/response types live in `shared/`.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| New orchestration dependencies (`LangGraph`, `LangSmith`) | The feature explicitly requires graph nodes, conditional edges, human approval gates, and execution tracing | Hand-written orchestration in route/service code would be harder to verify, less observable, and more brittle |

## Phase 0: Research Summary

- LangGraph is the chosen orchestration layer because it matches the required graph semantics.
- LangSmith is the chosen tracing/evaluation layer for prompt, run, and fallback visibility.
- Ship REST APIs are the only allowed runtime data source.
- Persisted outputs remain document-backed content under the unified document model.
- Human confirmation is mandatory before any state-changing action is sent to Ship APIs.

## Phase 1: Design Summary

- The core runtime model includes invocation context, state snapshots, findings, recommendations, draft outputs, approval gates, and fallback events.
- The API contract exposes contextual guidance, proactive findings, draft generation, approval confirmation, and portfolio summary endpoints.
- The UI integration reuses existing Ship views and editor flows rather than adding a separate authoring surface.

## Post-Design Constitution Check

- **I. Everything Is a Document**: Pass. Persisted outputs are still modeled as document-backed content.
- **II. Shared Editor and Four-Panel Layout**: Pass. Draft editing remains inside the shared document experience.
- **III. Boring Technology First**: Pass with documented exception. The new agent dependencies are justified and scoped to the orchestration layer only.
- **IV. Contracted APIs with OpenAPI**: Pass. The contract artifact defines every planned external route and reinforces the OpenAPI requirement.
- **V. Explicit Schema Evolution**: Pass. No schema change is assumed in the current design package.
- **VI. Untitled Means Untitled**: Pass. Document creation rules remain intact.
- **VII. Behavior Changes Require Verification**: Pass. Quickstart and requirement verification paths cover the intended behavior changes.
