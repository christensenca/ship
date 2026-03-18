# FleetGraph Presearch

## Phase 1: Define Your Agent

### 1. Agent Responsibility Scoping

#### What events in Ship should the agent monitor proactively?

**State transition events:**

- Issue state changes (`backlog` → `todo` → `in_progress` → `done`/`cancelled`) — tracked via `document_history` where `field = 'state'`
- Week boundary crossings — when computed week status flips from `active` to `completed` (derived from `sprint_number` + `workspace.sprint_start_date`)
- Assignment changes — `document_history` where `field = 'assignee_id'` or `field = 'belongs_to'` (sprint/project reassignment)
- Plan approval state changes — `plan_approval.state` transitions on week documents

**Temporal deadlines (clock-based, not event-based):**

- Week midpoint (Wednesday for a Mon-Sun week) — are in-progress issues actually moving?
- Week end approaching (2 days out) — is the sprint going to complete?
- Week start — does the new week have an approved plan and assigned issues?

**Absence events (things that *didn't* happen):**

- No standup document created for a person by end of workday
- No `issue_iterations` logged during a week that has in-progress issues
- No `document_history` entries on a project in the past 7 days (silent project)
- No `weekly_plan` created for people assigned to an active week
- No `weekly_retro` created after a week completes

**Threshold crossings:**

- A person's total `estimate_hours` across assigned `todo`/`in_progress` issues exceeds their `capacity_hours`
- An issue's `started_at` is > 5 days old with no `completed_at` and no recent `issue_iterations`
- A sprint has > 50% of issues still in `todo` with < 2 days remaining
- `issue_iterations` logged with `status = 'fail'` and `blockers_encountered` — unresolved for > 24 hours

#### What constitutes a condition worth surfacing?

A condition is worth surfacing when it meets **two criteria**: (1) it indicates drift between plan and reality, and (2) a human could take a concrete action to correct it.

**Always surface (action required):**

- Unresolved blockers older than 24 hours — someone needs to unblock or re-scope
- Active week with no approved plan — the PM or owner needs to approve or the team is working without direction
- In-progress issues with zero activity for 3+ business days — the assignee is stuck, context-switched away, or the issue should be re-assigned
- Sprint ending in 2 days with > 50% of issues still in `todo` — scope needs to be cut or carried forward explicitly

**Surface once (awareness, not action):**

- Missing standup streak (2+ consecutive workdays) — one reminder per streak, not daily nagging
- Capacity overload detected — surface when assignments change, not repeatedly
- Sprint spillover at week boundary — one notification listing carried issues, not ongoing alerts
- Plan modified after approval (`changed_since_approved`) — notify approver once

**Don't surface (noise):**

- Issues sitting in backlog with no sprint association — that's normal backlog behavior
- Missing retro during an active week — it's not due yet
- Low-priority issues aging in backlog (< 4 weeks old) — backlog is expected to have old items
- A single missed standup — life happens
- Issues completed ahead of schedule — good news doesn't need an alert

#### What is the agent allowed to do without human approval?

**Autonomous (read-only or low-risk writes):**

- Query any document, association, history, iteration, or comment data
- Compute derived metrics (velocity, capacity utilization, sprint completion %)
- Generate draft content (standup pre-fills, retro summaries, plan skeletons) — saved as drafts, not published
- Send notifications/nudges to relevant people (the nudge itself is the action; no data is changed)
- Create insight summaries (e.g., "Week 12 health report") as new documents with a clear `automated_by: 'fleetgraph'` marker

**Requires human approval:**

- Moving issues between sprints (changing `document_associations` with `relationship_type = 'sprint'`)
- Changing issue state (e.g., moving stale issues back to `backlog`)
- Reassigning issues (`properties.assignee_id`)
- Modifying priority
- Creating new issues (e.g., splitting a blocked issue into sub-tasks)
- Approving or rejecting week plans on someone's behalf

The line: **the agent can surface, draft, and recommend anything. It can only *change* data with human confirmation.**

#### What must always require confirmation?

- Any mutation to `documents` table (state, assignee, priority, associations)
- Any mutation to `document_associations` (moving issues between sprints/projects)
- Creating new documents on behalf of a user
- Sending messages/notifications that appear to come from a specific person (vs. from "FleetGraph")
- Archiving or deleting anything

#### How does the agent know who is on a project?

The relationship chain in the data model:

1. **Program → Projects**: `document_associations` where `relationship_type = 'program'` and `related_id` = program document id
2. **Project → Issues**: `document_associations` where `relationship_type = 'project'` and `related_id` = project document id
3. **Issues → People**: `properties->>'assignee_id'` on issue documents points to a person document's `properties->>'user_id'`
4. **Week → Owner**: `properties->>'owner_id'` on sprint documents — the person accountable for the week
5. **Week → Assignees**: `properties->'assignee_ids'` array on sprint documents — people explicitly assigned to a week
6. **Workspace → Members**: `workspace_memberships` table — all people with access

The agent builds a project roster by traversing: `program → projects → issues → assignees` UNION `program → weeks → owner + assignees`. This gives both "who is doing work" (issue assignees) and "who is accountable" (week owners).

#### How does the agent know who to notify?

Notification routing depends on the type of finding:


| Finding                                   | Notify                                                      | Why                                  |
| ----------------------------------------- | ----------------------------------------------------------- | ------------------------------------ |
| Stale issue (no activity 3+ days)         | Issue assignee, then week owner if no response              | Assignee should act; owner escalates |
| Sprint slipping (> 50% todo, 2 days left) | Week owner                                                  | Owner is accountable for the week    |
| Unresolved blocker (> 24 hours)           | Issue assignee + week owner + PM (project creator)          | Blockers need cross-role visibility  |
| Missing standup                           | The person who hasn't logged one                            | Only they can write it               |
| Unapproved plan                           | Week owner + the person in `plan_approval.approved_by` role | Owner submits, approver approves     |
| Capacity overload                         | The overloaded person + week owner                          | Person to flag, owner to re-scope    |
| Silent project (no activity 7+ days)      | All people with issues assigned in that project             | Everyone should know                 |


Fallback: if an issue has no assignee, notify the week owner. If there's no week owner, notify the project creator (`documents.created_by`). If all else fails, notify workspace admins.

#### How does the on-demand mode use context from the current view?

The chat interface receives context based on where the user invoked it:


| View                 | Context injected                                                                                                                                                                                                      |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Issue page**       | The issue document (title, state, priority, assignee, estimate), its full `issue_iterations` history, `document_history`, `comments`, parent project/sprint associations, and the assignee's other in-progress issues |
| **Sprint/Week page** | The week document (plan, approval state, owner), all associated issues with states, all assigned people with capacity, `sprint_iterations`, the previous week's completion rate for comparison                        |
| **Project page**     | The project document, all associated issues grouped by state, all associated weeks, team members derived from issue assignees, backlog depth                                                                          |
| **Program page**     | The program document, all child projects with health summaries, cross-project metrics (velocity, blocker count, completion rate), all week owners                                                                     |
| **Person page**      | The person document (capacity, skills), all their assigned issues across projects/sprints, their standup history, their iteration history                                                                             |


The agent always knows: (1) **what** the user is looking at, (2) **who** the user is, and (3) **when** they're asking (current week context, days remaining, etc.). This scoping means the chat never starts cold — it starts with the full context of the current view pre-loaded.

---

### 2. Use Case Discovery

#### Use Case 1: Sprint Health Check (PM)

- **Role**: PM
- **Trigger**: Proactive — runs at week midpoint and 2 days before week end; on-demand — PM opens a week and asks "how are we tracking?"
- **What the agent detects/produces**: Compares planned issues (associated with this sprint) against actual state. Calculates: % done, % in-progress, % still in todo. Identifies stale issues (in-progress but no activity). Identifies blockers from `issue_iterations`. Compares against previous week's velocity. Produces a structured health summary: "5/8 issues done, 2 in-progress (1 stale for 3 days — AUTH-42), 1 blocked (AUTH-45 — dependency on AUTH-38)."
- **What the human decides**: Whether to cut scope (move issues to next week), reassign stale issues, or escalate blockers.

#### Use Case 2: Blocker Escalation (Engineer → PM)

- **Role**: Engineer (detected), PM (notified)
- **Trigger**: Proactive — `issue_iterations` logged with `status = 'fail'` and `blockers_encountered` text, and no subsequent `pass` iteration within 24 hours.
- **What the agent detects/produces**: Identifies the blocked issue, the blocker description, the assignee, how long it's been blocked, and — critically — attempts to find the *blocking* issue by searching for related issues in the same project/sprint that match the blocker description. Produces: "AUTH-42 has been blocked for 2 days. Blocker: 'waiting on API auth token refresh endpoint.' Likely blocked by AUTH-38 (assigned to Sarah, in-progress for 4 days). Sarah is at 110% capacity this week."
- **What the human decides**: Whether to reassign the blocking issue, pair on it, or re-scope the blocked issue.

#### Use Case 3: Capacity Balancing (PM)

- **Role**: PM
- **Trigger**: Proactive — when issue assignments change (detected via `document_history` on `assignee_id` field); on-demand — PM asks "who's overloaded?"
- **What the agent detects/produces**: For each person assigned to the current week: sums `estimate_hours` across their `todo` + `in_progress` issues, compares to `capacity_hours`. Flags anyone over 100%. Identifies people under 50% who could absorb work. Produces a capacity table and specific rebalancing recommendations: "Move AUTH-45 (3h estimate) from Sarah (120%) to Mike (40%)."
- **What the human decides**: Whether to accept the rebalancing suggestion, adjust estimates, or defer issues instead.

#### Use Case 4: Weekly Plan Generation (PM/Engineer)

- **Role**: PM or Engineer
- **Trigger**: On-demand — user opens a new week that has no plan; proactive — week starts with no `weekly_plan` document.
- **What the agent detects/produces**: Pulls the highest-priority unassigned issues from the project backlog. Looks at carried-over issues from last week (sprint spillover). Factors in each person's `capacity_hours` and existing assignments. Drafts a weekly plan: proposed issues per person, estimated hours, and flags any issue that has unresolved blockers. Also generates success criteria based on the issue titles/content.
- **What the human decides**: Which issues to actually commit to, whether capacity estimates are accurate, whether to add/remove people from the week.

#### Use Case 5: "What Should I Work on Next?" (Engineer)

- **Role**: Engineer
- **Trigger**: On-demand — engineer opens their person page or any sprint view and asks "what's next?"
- **What the agent detects/produces**: Looks at the engineer's assigned issues across all active sprints. Ranks by: (1) issues in `in_progress` that they started (finish what you started), (2) issues with `priority: high` in `todo`, (3) issues blocking other team members (found by cross-referencing `blockers_encountered` text across `issue_iterations`), (4) issues with approaching sprint deadline. Produces a prioritized list with reasoning: "1. AUTH-38 — you started this 2 days ago and AUTH-42 is blocked on it. 2. AUTH-50 — high priority, estimated 2h, sprint ends Thursday."
- **What the human decides**: What to actually work on (the agent recommends, never assigns).

#### Use Case 6: Standup Draft (Engineer)

- **Role**: Engineer
- **Trigger**: On-demand — engineer opens standup and asks "draft my standup"; proactive — it's 4pm and no standup exists for today.
- **What the agent detects/produces**: Reads today's `document_history` for the engineer's assigned issues (state changes, edits). Reads any `issue_iterations` logged today. Synthesizes into standup format: what was done, what's in progress, any blockers. "Yesterday: Completed AUTH-38 (token refresh endpoint). Today: Starting AUTH-50 (rate limiting). Blocked: nothing currently."
- **What the human decides**: Whether the draft is accurate, what to add/edit before saving.

#### Use Case 7: Portfolio Drift Report (Director)

- **Role**: Director
- **Trigger**: Proactive — weekly (e.g., Monday morning); on-demand — director opens program view and asks "how are my programs doing?"
- **What the agent detects/produces**: For each program: aggregates project health (% of current sprint issues completed), identifies projects with unresolved blockers, flags silent projects (no activity in 7+ days), compares velocity trends across weeks. Produces a ranked report: "Program AUTH: on track (85% sprint completion). Program INGEST: at risk — Project Pipeline has 3 unresolved blockers and 0 issues completed this week. Program BILLING: stalled — no activity in 9 days."
- **What the human decides**: Where to focus attention, whether to intervene on at-risk programs, who to talk to.

---

### 3. Trigger Model Decision

#### When does the proactive agent run without a user present?

Two trigger types:

**Scheduled (cron-style):**

- **Morning scan** (start of business): Check all active weeks for unapproved plans, missing weekly plans, capacity overloads. Deliver findings before people start working.
- **Midweek check** (Wednesday): Sprint health check on all active weeks. Compare plan vs. progress. Flag anything at risk of slipping.
- **End-of-week scan** (Friday): Sprint completion summary. Identify spillover issues. Pre-generate retro data for each week.
- **End-of-day standup check** (4pm): Flag people with in-progress issues who haven't logged a standup.

**Event-driven (webhook-style):**

- When `issue_iterations` is inserted with `status = 'fail'` — start the 24-hour blocker escalation timer.
- When `document_history` records an `assignee_id` change — re-run capacity calculation for affected people.
- When a week document's `plan_approval.state` changes — notify relevant people.
- When an issue state changes to `in_progress` — update the person's capacity utilization.

#### Poll vs. webhook vs. hybrid — what are the tradeoffs?

**Our choice: Hybrid.** Here's why:


| Approach         | Pros                                                                                                                                   | Cons                                                                                                                                                                         |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Poll-only**    | Simple to implement. No changes to existing API. Easy to reason about timing.                                                          | Wasteful — most polls find nothing. Latency between event and detection (up to poll interval). Scales poorly — O(projects × poll_frequency).                                 |
| **Webhook-only** | Instant detection. No wasted computation. Scales with activity, not entity count.                                                      | Requires instrumenting every write path in the API. Misses *absence* events entirely (you can't webhook "nothing happened"). Complex to implement across all mutation paths. |
| **Hybrid**       | Webhooks for instant detection of state changes. Scheduled polls for absence detection and time-based conditions. Best of both worlds. | More complex architecture — two trigger paths into the same graph. Need to deduplicate (webhook detects a blocker at 2pm, poll re-detects at 4pm).                           |


The hybrid model is necessary because Ship's most important drift signals are **absence signals** — things that *didn't* happen. You can't webhook a missing standup. You have to poll for it.

**Implementation:**

- Express API middleware emits events to an in-process event bus when documents/associations/iterations are mutated.
- A scheduler (node-cron or similar) fires scheduled scans.
- Both paths feed into the same LangGraph entry point with different `trigger_type` metadata (`event` vs. `scheduled`).

#### How stale is too stale for your use cases?


| Use Case                    | Maximum acceptable staleness                        | Why                                                                                    |
| --------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Blocker escalation          | **< 1 hour** after the 24-hour threshold is crossed | Blockers are the highest-cost drift — every hour an engineer is blocked costs the team |
| Sprint health at midweek    | **< 4 hours**                                       | This is a summary, not an alert — morning delivery is fine                             |
| Missing standup nudge       | **Same business day**                               | Nudging the next day defeats the purpose                                               |
| Capacity overload detection | **< 30 minutes** after assignment change            | A PM needs to know immediately if they just overloaded someone                         |
| Portfolio report            | **< 12 hours**                                      | Directors check this daily, not in real-time                                           |
| Sprint spillover            | **Within 2 hours** of week boundary crossing        | Carried issues need to be triaged early in the new week                                |


#### What does your choice cost at 100 projects? At 1,000?

**Scheduled scans:**

- 4 scans/day × 365 days = 1,460 scans/year
- Each scan queries active weeks + their issues. At 100 projects (~20 active weeks at any time): ~20 queries per scan = 29,200 queries/year. Negligible.
- At 1,000 projects (~200 active weeks): ~200 queries per scan = 292,000 queries/year. Still manageable — these are indexed queries on `document_type`, `document_associations`, and `properties` GIN index.
- LLM cost: Each scan produces findings that need reasoning. At 100 projects, ~5 findings per scan average = 7,300 LLM calls/year. At $0.01/call (GPT-4o-mini for triage) = **$73/year**.
- At 1,000 projects, ~50 findings per scan = 73,000 LLM calls/year = **$730/year**.

**Event-driven triggers:**

- Scales with write activity, not entity count. A busy 100-project workspace might generate ~500 relevant events/day = 182,500 events/year.
- Most events require only a quick check (e.g., "did this assignment change push someone over capacity?") — cheap DB query, no LLM needed.
- ~10% of events need LLM reasoning = 18,250 LLM calls/year = **$183/year**.
- At 1,000 projects: ~5,000 events/day = 1.8M events/year, ~180K LLM calls = **$1,800/year**.

**Total estimated cost at scale:**

- 100 projects: ~$256/year in LLM costs + negligible DB load
- 1,000 projects: ~$2,530/year in LLM costs + moderate DB load (add read replicas if needed)

The hybrid approach scales linearly with activity, not quadratically. The scheduled scans are fixed-cost (4/day regardless of scale), and the event-driven triggers only fire when something actually changes.

---

## Phase 2: Graph Architecture

### 4. Node Design

#### What are your context, fetch, reasoning, action, and output nodes?

The graph has a unified pipeline that both proactive and on-demand modes enter. The difference is *how* they enter, not *what* they traverse.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        ENTRY POINTS                                 │
│                                                                     │
│   [Scheduled Trigger]    [Event Trigger]    [Chat Message]          │
│         │                      │                  │                  │
│         └──────────┬───────────┘                  │                  │
│                    ▼                              ▼                  │
│            ┌──────────────┐              ┌──────────────┐           │
│            │ ROUTE_INTENT │              │ PARSE_CHAT   │           │
│            │  (context)   │              │  (context)   │           │
│            └──────┬───────┘              └──────┬───────┘           │
│                   └──────────┬─────────────────┘                    │
│                              ▼                                      │
│                    ┌───────────────────┐                             │
│                    │   GATHER_CONTEXT  │                             │
│                    │     (fetch)       │                             │
│                    └────────┬──────────┘                             │
│                             │                                       │
│              ┌──────────────┼──────────────┐                        │
│              ▼              ▼              ▼                         │
│     ┌──────────────┐ ┌──────────┐ ┌──────────────┐                 │
│     │ FETCH_ISSUES │ │FETCH_WEEK│ │ FETCH_PEOPLE │  (parallel      │
│     │   (fetch)    │ │ (fetch)  │ │   (fetch)    │   fetch nodes)  │
│     └──────┬───────┘ └────┬─────┘ └──────┬───────┘                 │
│            └──────────────┼──────────────┘                          │
│                           ▼                                         │
│                  ┌─────────────────┐                                │
│                  │    ANALYZE      │                                │
│                  │  (reasoning)    │──── LLM call: detect drift,    │
│                  └────────┬────────┘     answer question, or        │
│                           │              identify action needed      │
│                           ▼                                         │
│                  ┌─────────────────┐                                │
│                  │  ROUTE_ACTION   │                                │
│                  │ (conditional)   │                                │
│                  └───┬────┬────┬───┘                                │
│           ┌──────────┘    │    └──────────┐                         │
│           ▼               ▼               ▼                         │
│   ┌──────────────┐ ┌───────────┐ ┌──────────────┐                  │
│   │   RESPOND    │ │  PROPOSE  │ │    NOTIFY    │                  │
│   │  (output)    │ │  ACTION   │ │   (action)   │                  │
│   │ chat reply / │ │ (action)  │ │  send nudge  │                  │
│   │ health report│ └─────┬─────┘ └──────────────┘                  │
│   └──────────────┘       │                                          │
│                          ▼                                          │
│                 ┌─────────────────┐                                  │
│                 │  HUMAN_GATE     │                                  │
│                 │ (human-in-loop) │                                  │
│                 └────┬───────┬────┘                                  │
│              approved│       │rejected                               │
│                      ▼       ▼                                       │
│              ┌────────┐ ┌────────┐                                   │
│              │EXECUTE │ │ LOG &  │                                   │
│              │MUTATION│ │ CLOSE  │                                   │
│              │(action)│ │(output)│                                   │
│              └────┬───┘ └────────┘                                   │
│                   ▼                                                  │
│              ┌────────┐                                              │
│              │CONFIRM │                                              │
│              │(output)│                                              │
│              └────────┘                                              │
│                                                                     │
│   ┌────────────────┐                                                │
│   │ ERROR_FALLBACK │ ◄── any node can route here on failure         │
│   │   (fallback)   │                                                │
│   └────────────────┘                                                │
└─────────────────────────────────────────────────────────────────────┘
```

**Context Nodes:**


| Node           | Purpose                                                                                           | Input                                                            | Output                            |
| -------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------- |
| `ROUTE_INTENT` | Classifies a proactive trigger into an intent (sprint_health, blocker_check, capacity_scan, etc.) | Trigger metadata (type, scope, timestamp)                        | `{ intent, scope_ids, urgency }`  |
| `PARSE_CHAT`   | Extracts intent + entities from a user's chat message, merged with view context                   | Chat message + current view context (document ID, type, user ID) | `{ intent, entities, scope_ids }` |


**Fetch Nodes:**


| Node               | Purpose                                                               | DB Queries                                                                                                                       |
| ------------------ | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `GATHER_CONTEXT`   | Determines which fetch nodes to invoke based on intent                | None — pure routing logic                                                                                                        |
| `FETCH_ISSUES`     | Loads issues for a scope (sprint, project, or program)                | `documents` WHERE `document_type='issue'` + `document_associations` for scope filtering + `document_history` for recent activity |
| `FETCH_WEEK`       | Loads week document + approval state + associated issues + iterations | `documents` WHERE `document_type='sprint'` + `sprint_iterations` + week date computation                                         |
| `FETCH_PEOPLE`     | Loads people assigned to scope + capacity + current workload          | `documents` WHERE `document_type='person'` + aggregate `estimate_hours` from assigned issues                                     |
| `FETCH_ITERATIONS` | Loads issue_iterations for blocker detection                          | `issue_iterations` WHERE `issue_id` IN scope, ordered by `created_at` DESC                                                       |
| `FETCH_HISTORY`    | Loads document_history for activity/staleness detection               | `document_history` WHERE `document_id` IN scope, last 7 days                                                                     |


**Reasoning Nodes:**


| Node      | Purpose                                                                                 | LLM Call                                                                                                                           |
| --------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `ANALYZE` | Core reasoning — takes fetched data and produces findings, answers, or action proposals | System prompt with role context + structured data payload → returns JSON with `findings[]`, `suggested_actions[]`, `response_text` |


**Action Nodes:**


| Node               | Purpose                                          | Side Effects                                                                                       |
| ------------------ | ------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `NOTIFY`           | Sends a notification/nudge to relevant people    | Creates a notification record (new `notifications` table or in-app message) — no document mutation |
| `PROPOSE_ACTION`   | Packages a suggested mutation for human approval | Writes to `pending_actions` queue with the proposed change (e.g., "move issue X to next sprint")   |
| `EXECUTE_MUTATION` | Applies an approved action to Ship's database    | INSERT/UPDATE on `documents`, `document_associations`, `document_history`                          |


**Output Nodes:**


| Node            | Purpose                                                                 |
| --------------- | ----------------------------------------------------------------------- |
| `RESPOND`       | Formats and returns a chat reply or proactive report                    |
| `CONFIRM`       | Sends confirmation that a mutation was applied                          |
| `LOG_AND_CLOSE` | Records that a proposed action was rejected/snoozed and closes the loop |


**Error Node:**


| Node             | Purpose                                                                                                                                                                                                        |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ERROR_FALLBACK` | Catches failures from any node. Logs the error. For chat: returns "I couldn't complete that — here's what I know so far" with partial results. For proactive: silently logs and retries on next scheduled run. |


#### Which fetch nodes run in parallel?

```
            GATHER_CONTEXT
                 │
      ┌──────────┼──────────┬──────────────┐
      ▼          ▼          ▼              ▼
FETCH_ISSUES  FETCH_WEEK  FETCH_PEOPLE  FETCH_ITERATIONS
                                          │
                                    FETCH_HISTORY
                                   (depends on issue IDs
                                    from FETCH_ISSUES)
```

- `FETCH_ISSUES`, `FETCH_WEEK`, and `FETCH_PEOPLE` always run in **parallel** — they query independent tables with no data dependencies.
- `FETCH_ITERATIONS` runs in parallel with the above when scope IDs are known upfront (proactive triggers provide them).
- `FETCH_HISTORY` may depend on issue IDs from `FETCH_ISSUES` if the scope is broad (e.g., "all issues in this project"). In that case it runs **after** `FETCH_ISSUES` completes. For narrow scopes (single issue chat context), it runs in parallel since the ID is already known.

LangGraph's `Send()` API handles this — `GATHER_CONTEXT` dispatches to parallel branches, and they join at `ANALYZE`.

#### Where are your conditional edges and what triggers each branch?

```
ROUTE_INTENT ──┬── intent=sprint_health ──→ GATHER_CONTEXT(scope=week)
               ├── intent=blocker_check  ──→ GATHER_CONTEXT(scope=issue+week)
               ├── intent=capacity_scan  ──→ GATHER_CONTEXT(scope=week+people)
               ├── intent=portfolio_report → GATHER_CONTEXT(scope=program)
               └── intent=standup_check  ──→ GATHER_CONTEXT(scope=people+history)

ROUTE_ACTION ──┬── action_type=read_only   ──→ RESPOND (no mutation needed)
               ├── action_type=notify      ──→ NOTIFY → RESPOND
               ├── action_type=mutate      ──→ PROPOSE_ACTION → HUMAN_GATE
               └── action_type=none        ──→ RESPOND (informational only)

HUMAN_GATE ────┬── approved ──→ EXECUTE_MUTATION → CONFIRM
               ├── rejected ──→ LOG_AND_CLOSE
               └── snoozed  ──→ LOG_AND_CLOSE (with re-trigger timer)

ERROR_FALLBACK ◄── any node raises exception
```

**Key conditional logic:**

- `ROUTE_ACTION` decides based on the `ANALYZE` node's output. If the LLM determines an action is needed that mutates data, it routes through `HUMAN_GATE`. If it's purely informational, it goes straight to `RESPOND`.
- `GATHER_CONTEXT` selects which fetch nodes to invoke based on intent — a sprint health check doesn't need to fetch all people in the program, just the week's assignees.

---

### 5. State Management

#### What state does the graph carry across a session?

The LangGraph `State` object passed between nodes:

```typescript
interface FleetGraphState {
  // Entry context (set by trigger or chat)
  trigger_type: 'scheduled' | 'event' | 'chat';
  intent: string;                    // e.g., 'sprint_health', 'blocker_check'
  scope: {
    workspace_id: string;
    program_ids?: string[];
    project_ids?: string[];
    sprint_ids?: string[];
    issue_ids?: string[];
    person_ids?: string[];
  };
  user_context?: {                   // only for chat mode
    user_id: string;
    current_view: 'issue' | 'sprint' | 'project' | 'program' | 'person';
    current_document_id: string;
  };
  chat_history?: Message[];          // conversation turns for on-demand

  // Fetched data (populated by fetch nodes)
  issues: Issue[];
  week: WeekDocument | null;
  people: Person[];
  iterations: IssueIteration[];
  history: DocumentHistoryEntry[];
  associations: DocumentAssociation[];

  // Reasoning output (populated by ANALYZE)
  findings: Finding[];               // drift signals detected
  suggested_actions: ProposedAction[];
  response_text: string;             // formatted response for chat or report

  // Action tracking
  pending_action: ProposedAction | null;
  action_status: 'none' | 'proposed' | 'approved' | 'rejected' | 'snoozed' | 'executed';

  // Error state
  errors: { node: string; message: string; timestamp: Date }[];
}
```

For on-demand chat, `chat_history` accumulates across turns within a session. The user can ask follow-up questions and the graph re-runs with prior context preserved — no re-fetching unless scope changes.

#### What state persists between proactive runs?

Proactive runs are stateless by default — each scheduled scan starts fresh. But we persist:


| Persisted State      | Storage                            | Purpose                                                                                                                                               |
| -------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `notifications_sent` | `fleetgraph_notifications` table   | Deduplication — don't re-alert on the same blocker every scan. Keyed by `(finding_type, document_id, created_at)`. Expires after finding is resolved. |
| `pending_actions`    | `fleetgraph_pending_actions` table | Actions awaiting human approval survive across runs. The next scan checks if they're still relevant before re-proposing.                              |
| `run_log`            | `fleetgraph_runs` table            | Audit trail — when did the agent last run, what did it find, what did it do. Used for cost monitoring and debugging.                                  |
| `snooze_timers`      | `fleetgraph_snoozes` table         | When a human snoozes a finding, record the snooze expiry. Don't re-surface until timer expires.                                                       |


This means:

- **Scan 1** (Monday morning): Detects unapproved plan for Week 12. Sends notification to week owner.
- **Scan 2** (Wednesday midweek): Checks `notifications_sent` — plan is still unapproved. Escalates to PM (different notification, not a duplicate).
- **Scan 3** (after approval): Plan is now approved. Marks notification as resolved. No alert.

#### How do you avoid redundant API calls?

1. **Scope narrowing at `GATHER_CONTEXT`**: Only fetch what the intent needs. A blocker check on a single issue doesn't load all people in the program.
2. **Deduplication via `notifications_sent`**: If a proactive scan already found and notified about a condition, the next scan skips re-analyzing it (just checks if it's resolved).
3. **State reuse in chat sessions**: Fetched data stays in `FleetGraphState` across chat turns. Follow-up questions reuse the same `issues`, `week`, `people` arrays unless the user changes scope.
4. **Batch queries**: Fetch nodes use `WHERE id = ANY($1)` with arrays rather than N+1 queries. A single `FETCH_ISSUES` call loads all issues for a sprint in one query.
5. **Short-lived cache for event-driven triggers**: When multiple events fire in quick succession (e.g., a PM reassigns 5 issues), the first event's fetch results are cached for 60 seconds and reused by subsequent event handlers.

---

### 6. Human-in-the-Loop Design

#### Which actions require confirmation?

Restated from Phase 1, now mapped to graph nodes:


| Action                                  | Graph Path                                           | Why                                                                  |
| --------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------- |
| Move issue to different sprint          | `PROPOSE_ACTION` → `HUMAN_GATE` → `EXECUTE_MUTATION` | Changes commitments                                                  |
| Change issue state                      | `PROPOSE_ACTION` → `HUMAN_GATE` → `EXECUTE_MUTATION` | May disagree with assessment                                         |
| Reassign issue                          | `PROPOSE_ACTION` → `HUMAN_GATE` → `EXECUTE_MUTATION` | Affects another person                                               |
| Change priority                         | `PROPOSE_ACTION` → `HUMAN_GATE` → `EXECUTE_MUTATION` | Subjective judgment                                                  |
| Create new issue                        | `PROPOSE_ACTION` → `HUMAN_GATE` → `EXECUTE_MUTATION` | Adds to scope                                                        |
| Send notification to another person     | Direct to `NOTIFY` (no gate)                         | Low-risk — the notification itself *is* the human seeing the finding |
| Generate draft document (standup, plan) | Direct to `RESPOND` (no gate)                        | Draft is shown to user, not saved until they confirm in the editor   |


#### What does the confirmation experience look like in Ship?

The confirmation UI appears **inline in the chat interface** or as a **notification action card**:

```
┌─────────────────────────────────────────────────────┐
│  FleetGraph                                          │
│                                                      │
│  AUTH-42 has been in-progress for 5 days with no     │
│  activity. Sarah is at 120% capacity this week.      │
│                                                      │
│  Suggested action:                                   │
│  ┌─────────────────────────────────────────────────┐ │
│  │ Move AUTH-42 to Week 13 backlog                 │ │
│  │ Reassign from Sarah → Mike (at 40% capacity)   │ │
│  │                                                 │ │
│  │  [Approve]  [Edit & Approve]  [Dismiss]  [Snooze 24h] │
│  └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

- **Approve**: Executes both mutations immediately. Writes to `document_history` with `automated_by: 'fleetgraph'`.
- **Edit & Approve**: Opens a modal where the user can modify the proposed changes (e.g., reassign to a different person) before confirming.
- **Dismiss**: Rejects the action. Logged in `fleetgraph_pending_actions` with `status: 'rejected'`. Agent won't re-propose this exact action.
- **Snooze 24h**: Defers the action. Agent will re-evaluate and potentially re-propose after the snooze expires.

#### What happens if the human dismisses or snoozes?

**Dismiss:**

- Action is marked `rejected` in `fleetgraph_pending_actions`
- The specific proposed action (e.g., "move AUTH-42 to Week 13") is not re-proposed
- But the underlying *finding* (AUTH-42 is stale) remains — the next scan may propose a *different* action (e.g., "ping Sarah about AUTH-42" instead of reassigning)

**Snooze:**

- Action is marked `snoozed` with an `expires_at` timestamp
- Finding and action are suppressed until expiry
- On expiry, the agent re-evaluates: if the condition is resolved (issue completed), nothing happens. If still present, it re-proposes (possibly with updated context: "AUTH-42 is now stale for 7 days, previously snoozed")

**No response (ignored):**

- Pending actions expire after 48 hours with no interaction
- Treated as implicit snooze — agent re-evaluates on next relevant scan
- After 3 consecutive ignores on the same finding type, agent reduces notification frequency for that user (learns that this user doesn't want this type of alert)

---

### 7. Error and Failure Handling

#### What does the agent do when Ship API is down?

The agent queries the database directly (not through the REST API), so "API down" means either:

**Database unreachable:**

- `ERROR_FALLBACK` catches the connection error
- Proactive mode: logs the failure, skips this scan, retries on next scheduled run. No user-visible impact.
- Chat mode: returns "I'm having trouble accessing project data right now. Try again in a few minutes." with the partial context it already had (e.g., view context from the frontend).

**Specific query fails (timeout, bad data):**

- The failing fetch node returns an error state instead of crashing the graph
- `ANALYZE` receives partial data and adjusts: "Based on available data (issues loaded, but iteration history unavailable), here's what I can tell you..."
- The response is flagged as `partial: true` so the UI can indicate reduced confidence

#### How does it degrade gracefully?

Degradation tiers:

```
Tier 1 (Full)     All fetch nodes succeed    →  Full analysis + actions
Tier 2 (Partial)  1-2 fetch nodes fail       →  Analysis with caveats, no actions proposed
Tier 3 (Stale)    DB down, cache available   →  "Last known state as of [time]" report
Tier 4 (Offline)  DB down, no cache          →  Chat: error message. Proactive: silent skip.
```

**For chat mode**, the agent always responds — even if degraded. A partial answer ("I can see 5 issues in this sprint but couldn't load iteration history to check for blockers") is better than an error page.

**For proactive mode**, silence is acceptable. A missed scan is invisible to users. The agent logs the failure and catches up on the next run. No false alarms, no partial notifications.

#### What gets cached and for how long?


| Data                                | Cache Duration                     | Storage                            | Invalidation                                                            |
| ----------------------------------- | ---------------------------------- | ---------------------------------- | ----------------------------------------------------------------------- |
| Issue list per sprint               | 60 seconds                         | In-memory (per-process)            | Invalidated by any `document_history` event on issues in that sprint    |
| Person capacity calculations        | 5 minutes                          | In-memory                          | Invalidated by `assignee_id` change events                              |
| Week document + approval state      | 30 seconds                         | In-memory                          | Invalidated by any update to that document                              |
| Previous week's velocity (computed) | 1 hour                             | `fleetgraph_cache` table           | Invalidated when previous week's issues change state                    |
| LLM analysis results                | Not cached                         | —                                  | Every analysis runs fresh (context changes too fast to cache reasoning) |
| Chat session state                  | Session duration (max 30 min idle) | In-memory (LangGraph checkpointer) | Expires on session timeout                                              |


**Cache philosophy**: Cache *data*, never cache *reasoning*. The LLM should always reason over fresh (or clearly-labeled stale) data. Caching is only to avoid hammering the DB with identical queries within short windows (e.g., multiple event-driven triggers in rapid succession).

---

## Phase 3: Stack and Deployment

### 8. Deployment Model

#### Where does the proactive agent run when no user is present?

The proactive agent runs **inside the existing API process** on Railway — not as a separate service.

```
┌──────────────────────────────────────────────────────┐
│  Railway: API Service (single process)                │
│                                                       │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │ Express API  │  │ Collaboration│  │ FleetGraph  │ │
│  │ (REST +      │  │ Server       │  │ Agent       │ │
│  │  WebSocket)  │  │ (Yjs sync)   │  │             │ │
│  └──────┬───────┘  └──────────────┘  └──┬──────┬───┘ │
│         │                               │      │      │
│         │  ┌────────────────────────────┘      │      │
│         │  │  event bus (in-process)           │      │
│         │  │                                    │      │
│         ▼  ▼                                    │      │
│  ┌─────────────────┐              ┌─────────────┘     │
│  │ Event Emitter   │              │                    │
│  │ (mutations fire │              │  node-cron         │
│  │  agent events)  │              │  (scheduled scans) │
│  └─────────────────┘              └────────────────────│
│                                                       │
│         ┌─────────────────────────┐                   │
│         │  PostgreSQL (Railway)   │                   │
│         │  - Ship tables          │                   │
│         │  - fleetgraph_* tables  │                   │
│         └─────────────────────────┘                   │
│                                                       │
│         ┌─────────────────────────┐                   │
│         │  OpenAI API (external)  │                   │
│         └─────────────────────────┘                   │
│                                                       │
│         ┌─────────────────────────┐                   │
│         │  LangSmith (external)   │                   │
│         │  (tracing/observability)│                   │
│         └─────────────────────────┘                   │
└──────────────────────────────────────────────────────┘
```

**Why in-process, not a separate service:**

- Ship is a small team tool, not a high-scale SaaS. A separate worker service doubles Railway costs and adds deployment complexity for minimal benefit.
- The agent needs direct access to the same DB connection pool the API uses. No need for a separate connection.
- Event-driven triggers need to fire from API mutation paths — an in-process event emitter is simpler and lower-latency than a message queue.
- If load becomes an issue later, the agent can be extracted to a Railway worker service with a shared DB. But start simple.

**Process lifecycle:**

- Agent initializes when the API server boots (`server.ts` → `initFleetGraph()`)
- Scheduled scans register via `node-cron` on startup
- Event listeners attach to an in-process `EventEmitter` that API routes fire into
- If the API process restarts (Railway deploy, crash recovery), the agent re-initializes — no state is lost because persistence is in PostgreSQL (`fleetgraph_`* tables), not memory

#### How is it kept alive?

Railway keeps the API service running as a long-lived process. The agent piggybacks on this:

- **Railway health checks**: The existing `/health` endpoint already keeps Railway from killing the process. No additional configuration needed.
- **Cron resilience**: `node-cron` runs in-process. If the process restarts, cron jobs re-register on boot. A scan that was interrupted mid-execution simply runs again on the next scheduled interval — proactive scans are idempotent (deduplication via `fleetgraph_notifications`).
- **No external orchestration**: No need for Railway cron jobs, external schedulers, or a separate keepalive mechanism. The API process IS the agent runtime.
- **Crash recovery**: If the API crashes mid-scan, the `fleetgraph_runs` table will have an incomplete entry. On restart, the agent detects this and runs an immediate catch-up scan before resuming the normal schedule.

#### How does it authenticate with Ship without a user session?

The proactive agent bypasses Ship's session-based auth entirely — it runs **inside** the API process and queries the database directly using the same `pg` pool:

```
User request → Express middleware → session check → route handler → pg.query()
                                                                      ↑
Agent trigger → FleetGraph graph → fetch node ─────────────────────────┘
                                                 (same pg pool, no session needed)
```

- **No user impersonation**: The agent doesn't pretend to be a user. All mutations are tagged with `automated_by: 'fleetgraph'` in `document_history`, not a user ID.
- **Workspace scoping**: The agent iterates over all workspaces in the database. Each scan is scoped to a single `workspace_id` — the agent respects the same workspace boundaries as the API.
- **For chat mode**: The user IS authenticated (they're using the app). The chat API endpoint (`/api/fleetgraph/chat`) goes through normal session middleware. The user's `workspace_id` and `user_id` are passed to the graph as context — the agent only sees data the user has access to.
- **API keys for external services**: OpenAI API key and LangSmith API key are stored as Railway environment variables (`OPENAI_API_KEY`, `LANGSMITH_API_KEY`). Accessed via `process.env` at boot.

---

### 9. Performance

#### How does your trigger model achieve the < 5 minute detection latency goal?

The two trigger types have different latency profiles:

**Event-driven triggers: < 1 second latency**

```
User action (e.g., logs a failed iteration)
  → Express route handler writes to DB
  → After DB commit, fires: eventBus.emit('iteration:created', { ... })
  → FleetGraph listener receives event
  → Runs lightweight check (e.g., "is this a blocker? has it been > 24h?")
  → If threshold met → enters graph pipeline
  → Total: ~500ms for check, ~3-5s if LLM reasoning needed
```

No polling delay. The event fires synchronously after the DB write. The check itself is a single DB query (e.g., "find the most recent passing iteration for this issue"). Only if the check triggers a finding does the LLM get called.

**Scheduled scans: latency = time until next scan**


| Scan               | Frequency     | Worst-case latency                               |
| ------------------ | ------------- | ------------------------------------------------ |
| Morning scan       | Daily 8:00 AM | ~24 hours (if condition arises at 8:01 AM)       |
| Midweek check      | Wednesday     | ~7 days (but this is by design — it's a summary) |
| End-of-day standup | Daily 4:00 PM | ~24 hours                                        |
| End-of-week        | Friday        | ~7 days                                          |


For the critical use cases (blockers, capacity overload), the event-driven path handles detection in under 5 seconds. Scheduled scans only catch **absence signals** where the acceptable latency is hours, not minutes.

**Achieving < 5 min for all critical paths:**


| Critical path                    | Trigger type                                         | Detection latency                    |
| -------------------------------- | ---------------------------------------------------- | ------------------------------------ |
| Blocker logged                   | Event (`iteration:created` with `status='fail'`)     | < 1s detection, 24h escalation timer |
| Blocker escalation (24h expired) | Scheduled (hourly micro-scan for expired timers)     | < 1 hour                             |
| Capacity overload                | Event (`history:created` with `field='assignee_id'`) | < 5s                                 |
| Issue goes stale (3+ days)       | Scheduled (morning scan)                             | < 12 hours                           |
| Sprint slipping                  | Scheduled (midweek + event on state changes)         | < 4 hours                            |


The only gap: blocker escalation at exactly the 24-hour mark. To close this, add a lightweight **micro-scan every 15 minutes** that checks `fleetgraph_notifications` for any pending escalation timers that have expired. This is a single indexed query — not a full workspace scan.

```
SELECT * FROM fleetgraph_notifications
WHERE type = 'blocker_timer'
  AND escalate_at <= NOW()
  AND status = 'pending';
```

Cost: negligible. 96 queries/day, each returning 0-2 rows.

#### What is your token budget per invocation?

Token costs vary dramatically by invocation type. Budget by tier:

**Tier 1: Lightweight checks (no LLM) — $0.00**

- Capacity calculation after assignment change
- Checking if a blocker timer has expired
- Counting issues per state in a sprint
- These are pure DB queries with arithmetic — no tokens consumed

**Tier 2: Triage reasoning (GPT-4o-mini) — ~$0.005/call**

- Input: ~1,500 tokens (structured data: 10-20 issues with state/assignee/dates, 1 week summary)
- Output: ~500 tokens (JSON: findings array, severity, suggested actions)
- Model: `gpt-4o-mini` ($0.15/1M input, $0.60/1M output)
- Cost: (1500 × $0.00015) + (500 × $0.0006) = **~$0.0005/call**
- Use for: Proactive scan findings, sprint health summaries, standup drafts

**Tier 3: Deep reasoning (GPT-4o) — ~$0.03/call**

- Input: ~4,000 tokens (full issue context with iterations, history, blocker text, cross-references)
- Output: ~1,000 tokens (detailed analysis, specific recommendations with reasoning)
- Model: `gpt-4o` ($2.50/1M input, $10.00/1M output)
- Cost: (4000 × $0.0025) + (1000 × $0.01) = **~$0.02/call**
- Use for: Blocker root cause analysis, capacity rebalancing recommendations, portfolio reports

**Tier 4: Chat conversation (GPT-4o) — ~$0.05/turn**

- Input: ~6,000 tokens (view context + chat history + fetched data)
- Output: ~1,500 tokens (conversational response with data references)
- Cost: (6000 × $0.0025) + (1500 × $0.01) = **~$0.03/turn**
- A typical chat session is 3-5 turns = **$0.09-0.15/session**

**Budget caps:**

- Proactive scans: cap at **$0.50/day** across all workspaces. If exceeded, defer non-critical scans to next day.
- Chat: cap at **$0.50/session** (hard limit ~15 turns). After that, "I've reached my analysis budget for this session. Start a new chat for more."
- Per-workspace monthly cap: **$50/month**. Configurable by workspace admin.

#### Where are the cost cliffs in your architecture?

```
                        Cost curve
    $
    │
    │                                          ╱ cliff 3: every chat
    │                                        ╱   turn uses GPT-4o
    │                                      ╱
    │                               ╱─────╱
    │                  cliff 2:   ╱
    │                 event volume╱
    │              ramps up     ╱
    │           ╱──────────────╱
    │     ╱────╱
    │ ╱──╱  cliff 1: scheduled
    │╱      scans are fixed cost
    └──────────────────────────────────────── activity
          low        medium        high
```

**Cliff 1: Scheduled scans (fixed, predictable)**

- 4 scans/day regardless of workspace size
- Cost is proportional to number of *active weeks* (not total documents)
- A workspace with 1,000 archived issues costs the same as one with 10 — only active issues matter
- Risk: low. This never gets expensive.

**Cliff 2: Event-driven volume (linear with activity)**

- Each mutation fires an event → lightweight DB check → maybe an LLM call
- Most events (90%+) are handled by DB queries alone ($0)
- Risk: moderate. A PM bulk-reassigning 50 issues fires 50 events in seconds. Mitigation: **debounce** — batch events from the same user within a 5-second window into a single graph invocation. "Sarah reassigned 50 issues" → one capacity recalculation, not 50.

**Cliff 3: Chat usage (per-turn GPT-4o)**

- This is the most expensive path and the most unpredictable
- One power user running 10 chat sessions/day at 5 turns each = 50 GPT-4o calls = ~$1.50/day = $45/month
- If 10 users do this: $450/month — approaching the workspace cap
- Mitigation:
  - Use `gpt-4o-mini` for simple lookups ("what's the status of AUTH-42?") — route via intent classification
  - Only escalate to `gpt-4o` for complex reasoning ("why is the sprint slipping?")
  - Cache repeated questions within a session (same question about the same scope → cached response)
  - Session turn limits (15 turns max)

**Cliff 4 (theoretical): LangSmith tracing overhead**

- LangSmith traces every graph invocation. At high volume, trace storage could become costly.
- Mitigation: Sample proactive traces at 10% in production. Trace 100% of chat sessions (lower volume, higher debugging value).

---



