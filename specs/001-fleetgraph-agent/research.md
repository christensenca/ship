# FleetGraph Agent Research

## Decision 1: Use LangGraph for orchestration and LangSmith for tracing/evaluation

- **Decision**: Implement the FleetGraph agent as a LangGraph workflow in the existing TypeScript/Node stack, with LangSmith used for execution tracing, prompt inspection, and evaluation of agent behavior.
- **Rationale**: The feature requires explicit context nodes, fetch nodes, reasoning nodes, conditional edges, action nodes, human-in-the-loop gates, and fallback/error paths. A graph-based orchestration model matches those requirements directly and is easier to reason about than embedding branching logic inside ad hoc service methods. LangSmith adds observability and evaluation without changing the user-facing workflow.
- **Alternatives considered**:
  - Plain Express services with hand-written orchestration: rejected because the graph structure, branching, and approval gates would be scattered across route handlers and service code.
  - LangChain chains without graph orchestration: rejected because the feature needs durable branching, explicit gate transitions, and recoverable fallback paths.
  - Building a custom workflow engine: rejected because it would add unnecessary platform work before proving the product value.

## Decision 2: Treat Ship REST APIs as the only data source for the agent

- **Decision**: All runtime reads and writes for the FleetGraph agent will go through Ship REST endpoints; the agent will not query PostgreSQL directly.
- **Rationale**: The user explicitly requires REST-only access, and this keeps authorization, validation, and OpenAPI contracts in one place. It also avoids introducing a second data-access path that could drift from existing application behavior.
- **Alternatives considered**:
  - Direct database reads for performance: rejected because it bypasses API contracts and would create a split source of truth.
  - Hybrid API reads plus direct writes: rejected because it weakens guardrails around approval-sensitive mutations.
  - Separate agent-owned datastore: rejected for the initial release because persisted outputs can be represented through existing documents and API-backed metadata.

## Decision 3: Keep agent mutations behind explicit human approval gates

- **Decision**: The initial release will allow the agent to surface findings, draft content, and prepare recommended actions, but any change to issue state, assignment, priority, week membership, plan approval, or similar workflow data must wait for explicit human confirmation.
- **Rationale**: This matches the spec and research boundaries, preserves trust, and reduces the risk of the agent creating unintended workflow churn. It also keeps the first implementation focused on high-value guidance rather than autonomous workflow execution.
- **Alternatives considered**:
  - Auto-applying low-risk changes: rejected because the boundary between low-risk and business-impacting changes is too fuzzy for the first release.
  - Manual-only mode with no recommendation actions: rejected because users need clear next-step recommendations, not only passive summaries.

## Decision 4: Represent persisted outputs through the unified document model

- **Decision**: Any persisted summary, draft, or insight produced by FleetGraph will be stored as an existing or new document-backed artifact reachable through the unified document model, rather than as a separate content table.
- **Rationale**: This aligns with the Ship constitution and keeps generated content visible, linkable, and editable through existing document workflows. It also allows existing authoring, navigation, and auditing patterns to be reused.
- **Alternatives considered**:
  - Storing outputs only in transient agent state: rejected because users need durable drafts and summaries.
  - Creating dedicated content tables for findings and reports: rejected because these are content-bearing outputs that belong in the document model.

## Decision 5: Introduce dedicated FleetGraph orchestration routes with OpenAPI coverage

- **Decision**: Expose FleetGraph through dedicated API routes for contextual guidance, proactive findings, draft generation, portfolio summaries, and approval-triggered actions, and register each route with OpenAPI.
- **Rationale**: The feature is externally consumed by the Ship web app and needs stable contracts, request validation, and generated documentation. Dedicated routes also keep agent concerns separate from core document CRUD while still using the same authorization model.
- **Alternatives considered**:
  - Embedding agent execution inside existing document routes: rejected because it would blur responsibilities and make contracts harder to reason about.
  - Background-only processing with no explicit routes: rejected because on-demand guidance is a core use case.

## Decision 6: Use a hybrid trigger model

- **Decision**: Support both on-demand agent invocation from Ship views and proactive scans driven by scheduled jobs and event-triggered reevaluation.
- **Rationale**: The research shows that important findings come from both explicit events and absence/time-based conditions. A hybrid trigger model supports sprint health, blocker escalation, standup nudges, and portfolio reporting without forcing one trigger style onto every use case.
- **Alternatives considered**:
  - Poll-only scanning: rejected because it increases latency for high-value events.
  - Event-only execution: rejected because missing activity and week-boundary conditions cannot be detected by events alone.

## Decision 7: Keep the initial persistence model lightweight

- **Decision**: Avoid new schema changes in the first implementation unless execution evidence shows the existing document model and REST surfaces are insufficient; use existing documents plus API-managed metadata wherever possible.
- **Rationale**: The constitution favors incremental change. The first delivery can prove value using current data sources and document persistence patterns, reducing migration risk.
- **Alternatives considered**:
  - Introducing multiple new agent-specific tables up front: rejected because the usage patterns are not yet proven.
  - Avoiding any persistence at all: rejected because draft and summary workflows need durable outputs.
