# FlowPilot AI — Architecture

## 1. Guiding Principle

The system draws a hard line between two kinds of "actors" that can change
data: **humans acting through the REST API**, and **the AI agent acting
through tools**. Both are forced through the exact same `services/` layer.
This is what makes the following claims structurally true instead of just
documented intentions:

- The AI cannot run arbitrary MongoDB queries.
- Every write is validated the same way regardless of who initiated it.
- Every write is authorized against a role, regardless of who initiated it.
- Every write is audit-logged, regardless of who initiated it.

## 2. Layers

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend (React + TS + Tailwind)                            │
│  - Dashboard, chat interface for the AI assistant             │
└───────────────────────────┬───────────────────────────────────┘
                            │ REST (JWT auth)
┌───────────────────────────▼───────────────────────────────────┐
│  Express API Layer                                            │
│  routes/ → middleware(auth, rbac, validation) → controllers/  │
└───────────────────────────┬───────────────────────────────────┘
                            │ calls
┌───────────────────────────▼───────────────────────────────────┐
│  Service Layer (services/)                                     │
│  Business logic, validation, authorization checks,             │
│  audit logging. The ONLY layer allowed to touch models/.        │
└──────────┬────────────────────────────────┬───────────────────┘
           │                                 │
┌──────────▼───────────┐        ┌────────────▼────────────────┐
│ Mongoose Models       │        │ AI Tool Registry (ai/tools/) │
│ (models/)             │        │ getTasks, createBug, etc.    │
└───────────────────────┘        └────────────┬────────────────┘
                                                │ used by
                                  ┌─────────────▼─────────────┐
                                  │ Agent Orchestrator          │
                                  │ (ai/agent/, ai/planner/,     │
                                  │  ai/safety/, ai/providers/)  │
                                  └───────────────────────────┘
```

## 3. Agentic Execution Flow

```
User Goal (dashboard chat, or WhatsApp/email-triggered)
   │
   ▼
Understand  — LLM extracts intent + entities
   │
   ▼
Plan        — LLM produces a structured, ordered list of tool calls
   │
   ▼
Select Tools — planner output validated against the tool registry
   │           (unknown tools / malformed args are rejected here)
   ▼
Fetch/Analyze — read-only tools run first to gather context
   │
   ▼
Safety Check — risk score computed (records affected, field sensitivity,
   │           reversibility). Determines if approval is required.
   ▼
Human Approval (if required) — action preview shown, execution paused
   │           until an authorized user approves or rejects.
   ▼
Backup (if required) — snapshot relevant data to S3 before mutating.
   │
   ▼
Execute      — write tools run through the service layer.
   │
   ▼
Verify       — re-fetch affected data, confirm it matches the expected
   │           post-execution state.
   ▼
Report       — human-readable summary of what happened.
   │
   ▼
Audit Log    — permanent record written regardless of success/failure.
```

## 4. Why Controlled Tools Instead of Direct DB/Query Access

An LLM given raw database access is one bad prompt (or one hallucinated
query) away from deleting or corrupting production data with no
authorization boundary. A fixed tool registry means:

- The set of possible actions is enumerable and reviewable.
- Each tool's inputs are schema-validated independent of what the LLM
  claims it wants to do.
- Each tool carries its own authorization rule (e.g. `updateInventory`
  requires MANAGER+, `assignTask` requires TEAM_LEAD+).
- Risk scoring can be tool-specific (e.g. `createTask` is low-risk,
  `importData` and `updateInventory` at scale are high-risk).

## 5. Mock vs Real Integrations

Email, WhatsApp, and the AI provider itself are all built behind an adapter
interface with a `mock` implementation active by default (`*_PROVIDER=mock`
in `.env`). Mock adapters are clearly labeled as such in logs and any UI
that surfaces their output — they exist so the rest of the system
(ticket creation, agent flow, dashboards) can be built and tested end to
end before a real provider contract/credentials exist. Swapping to a real
provider is a config change plus a new adapter file, not a rewrite.

## 6. Roles (Phase 2)

`ADMIN > MANAGER > TEAM_LEAD > EMPLOYEE`, enforced in backend middleware
(`middleware/rbac.ts`, added in Phase 2) — never only hidden in the
frontend. Each AI tool additionally declares its own minimum role.

## 7. Data Model Overview (introduced progressively)

| Collection | Introduced | Purpose |
|---|---|---|
| users | Phase 2 | Auth + role |
| employees | Phase 3 | HR/org data linked to a user |
| projects | Phase 3 | Game dev projects |
| tasks | Phase 3 | Work items |
| bugs | Phase 4 | Bug/issue tracking |
| clientissues | Phase 5 | Client-reported issues |
| inboundmessages | Phase 11/12 | Raw email/WhatsApp messages |
| tickets | Phase 5 | Normalized ticket created from a message or bug |
| reminders / escalations | Phase 5 | Overdue tracking |
| aiconversations / aitoolcalls | Phase 6 | Agent interaction history |
| approvalrequests | Phase 7 | Pending human approvals |
| backups | Phase 8 | S3 backup manifests |
| auditlogs | Phase 2+ (used from day one) | Full action trail |
| aiusagelogs | Phase 9 | Token/cost tracking |
| awsusagelogs | Phase 10 | Cloud cost tracking |
| reports | Phase 13 | Generated management reports |
| inventoryitems | Phase 6/9 | Game items, for bulk import example |
| notifications | Phase 3+ | In-app alerts |
