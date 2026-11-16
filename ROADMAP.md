# FlowPilot AI — Evidence-based roadmap

Date: 2 November 2026 (Asia/Kolkata). Baseline: `PROJECT_AUDIT.md` for the supplied `flowpilot-ai 3` directory. This is a proposed implementation order, not work performed or authorization to change code, configuration, data, or deployment.

## Current iteration status — Authentication session integrity

Status: **Implemented and verified for newly issued sessions**.

- Refresh tokens now carry unique token IDs and family IDs.
- Refresh consumption uses a conditional atomic update; concurrent reuse cannot produce two successful rotations.
- Replayed or concurrently reused refresh tokens revoke the remaining family sessions.
- Access tokens issued by login/refresh are bound to an active refresh-token family, so logout revokes protected access immediately for those sessions.
- Frontend bootstrap and interceptor refresh share one deduplicated refresh request; refresh requests are excluded from automatic retry.
- Seed-admin setup now rejects an existing account with the wrong role or inactive status without changing it.
- Verification: backend `npm test -- --runInBand` — 12 suites, 255 tests passed; backend lint/build passed; frontend lint/build passed.

Known limitation: access tokens issued before this change without a family ID remain valid until their normal expiry. Legacy refresh tokens without family metadata are rejected rather than migrated.

## Current iteration status — Onboarding and lifecycle consistency

Status: **Partially implemented and unit-verified**.

- Employee creation now rejects inactive linked users and validates manager eligibility, active status, and reporting-cycle prevention.
- ADMINs can provision user accounts with an explicit role through the protected `/api/auth/users` endpoint; public registration remains EMPLOYEE-only.
- Employee deactivation synchronizes the linked user, removes project memberships, and unassigns tasks without deleting task history.
- Deactivation uses a MongoDB transaction when a live database connection is available; isolated unit tests exercise the mutation contract without a database.
- Project creation, manager reassignment, and project deactivation now enforce ADMIN authorization in the service layer.
- Inactive project managers are rejected.
- Removing a project member unassigns their tasks while preserving task records.
- Task mutation and assignment are rejected for inactive projects; assignees must remain active project members.
- Verification: focused lifecycle tests passed (122 tests); full backend suite passed (12 suites, 258 tests); backend lint/build passed.

Remaining gaps: real MongoDB transaction/integration coverage for multi-collection deactivation, broader admin role-management APIs, audit-event persistence, and explicit product policy for restoring memberships/tasks on employee reactivation.

## Current iteration status — Durable audit trail and transaction verification

- Audit persistence implementation: **Implemented and unit-verified**. Added immutable `AuditEvent` records with actor, role, action, target, outcome, sanitized before/after metadata, bounded error details, request ID support, and indexes.
- Audit integration coverage: **Implemented and unit/integration-verified with mocked services**. User provisioning, authentication success events, employee, project, and task lifecycle mutations are recorded; audit listing is ADMIN-only.
- Real MongoDB transaction verification: **Implemented and verified** against an isolated single-node MongoDB 8.3.4 replica set (`rs0`) on `127.0.0.1:27018`, using `MONGODB_REPLICA_URI`. Both commit and forced audit-write rollback scenarios passed.
- Failed-operation audit coverage: **Implemented and unit/integration-verified with mocked services** for invalid manager assignments, unauthorized project/task mutations, invalid membership/task assignments, inactive-project mutations, and authentication failures.
- Audit-write behavior: lifecycle deactivation records audit inside the transaction, so an audit failure rolls back employee, user, membership, and task changes. Production lifecycle mutations fail closed with 503 when transactions are unavailable. Other single-document mutations surface audit-write failures after the business write; these remain identifiable through operation errors but are not yet outbox-backed.

Remaining limitations: replica-set verification currently depends on explicitly provisioning `MONGODB_REPLICA_URI`; non-transactional audit writes still need an outbox/reconciliation mechanism; and audit failure events are not emitted for every possible validation branch.

## 1. Restore reproducible verification — first prerequisite

Current classification: **Blocked**.

- Confirm the authoritative working copy/commit; this directory has no Git metadata and differs from HANDOVER.md.
- Use an isolated test workspace and dependency installation from both lockfiles. Keep original files and secrets unchanged. Record Node/npm and exact install/check outputs.
- Establish a disposable MongoDB test database and isolated runtime configuration; never run seed/write tests against an unidentified existing database.
- Run frontend/backend lint and build and backend tests. Resolve actual failures only after recording the baseline; do not weaken rules to obtain a pass.
- Establish dedicated ADMIN, MANAGER, TEAM_LEAD and EMPLOYEE test identities and unrelated teams/projects in that disposable environment.
- Update setup documentation to reflect actual paths, chosen API port, frontend origin, credentialed CORS and cookie topology.

Exit criteria: reproducible installation; five available commands run to completion with recorded outcomes; API health confirms the isolated database connection; zero changes to real operational data. Frontend test harness is added in milestone 4, not assumed to exist today.

## 2. Repair authorization and session integrity — highest priority

Current classification: **Partially implemented**. Addresses F01–F05, F10, F12.

- Define a four-role permission matrix, including employee directory visibility, manager team scope, TEAM_LEAD access and deactivation semantics.
- Enforce employee ownership/team rules at the service boundary; cover direct service/tool calls as well as HTTP routes. Preserve legitimate admin and project-owner capabilities.
- Give every refresh token a unique random identifier and enforce atomic single-use rotation. Define replacement failure and replay behavior; avoid revoking a session into an unrecoverable state on issuance failure.
- Unify frontend session bootstrap and interceptor refresh deduplication. Exclude refresh requests from automatic refresh retry; verify StrictMode and concurrent tabs.
- Implement the chosen access-token revocation policy for deactivation/role changes/logout. Surface logout failures accurately.
- Make seed behavior explicitly verify an existing account's role/active state without silently changing it.

Exit criteria: unrelated TEAM_LEAD/manager accesses fail; own-scope operations succeed; rapid login/refresh produces distinct usable sessions; one refresh token cannot be concurrently consumed twice; replay and inactive-user sessions fail as specified. All tests include negative authorization cases and real token/index behavior.

## 3. Complete onboarding and CRUD consistency

Current classification: **Partially implemented**, with user administration **Not implemented**. Addresses F06–F09, F13.

- Add admin-only user search/provisioning/role changes with audit events and clear handling for users without employee profiles. Registration must continue to reject role escalation.
- Define manual versus generated employee/project human IDs; if generation is required, make it concurrency-safe. Label User IDs and Employee IDs unambiguously.
- Add employee manager assignment UI backed by eligible active manager selection, role checks and cycle prevention. Reject inactive project managers.
- Make Employee/User active-state changes atomic or provide explicit recoverable consistency guarantees.
- Define membership removal and project inactivity behavior for existing assigned tasks; reconcile access and assignments according to that policy.
- Fix project deadline omitted/null handling; decide whether project reactivation is required and implement it explicitly if so.
- Add paginated/searchable project/employee selectors and explicit loading/error/retry states.
- Validate scalar filters and map schema/duplicate errors into consistent 4xx responses. Test concurrent unique-ID creation.

Exit criteria: admin provisions user → links employee → assigns manager → creates project → adds member → assigns task; employee performs only allowed transitions; manager reviews/completes; reassignment, removal, deactivation and concurrent updates preserve defined invariants. Clearing a project deadline persists correctly. Records beyond the first 100 remain selectable.

## 4. Prove the full application in database and browser tests

Current classification: real-database/browser verification **Blocked**; corresponding automated harnesses **Not implemented**. Addresses F11, F14 and verification gaps across all implemented modules.

- Keep useful mocked tests and add a separate isolated real-MongoDB suite for indexes, aggregation, population, persistence, sessions and multi-record changes.
- Add frontend tests for permissions, session bootstrap, stale-data reset, date/filter serialization, failures and selector pagination.
- Add browser E2E tests for all roles: register/login/logout/reload; deep links; profile missing/present; dashboard partial failures; employee/project/task workflows; 401/403/404/422; search/filter/pagination; network interruptions.
- Correct stale detail/status display and failed mutation feedback. Verify sidebar/dialog keyboard focus, escape, scroll lock and small-screen layout.
- Establish CI with lint/build/test checks and explicit test-database isolation. Record a measured coverage baseline without treating a percentage as proof of workflow correctness.

Exit criteria: the user lifecycle and core CRUD flows pass in a browser against real isolated persistence; unauthorized direct API requests fail; errors never appear as fabricated success/empty data; fresh evidence supports upgrading individual features to **Implemented and verified**.

## 5. Establish durable audit and safe tool contracts

Current classification: **Not implemented**; existing services are only a partial prerequisite.

- Persist actor, role, action, affected resource, timestamp, request/workflow correlation, outcome and appropriately redacted before/after evidence.
- Define audit retention/access controls and failure behavior. Do not substitute console request logs for action history.
- Create a fixed typed registry with independent input validation, requester authorization, read/write classification and explicit service contracts.
- Start with scoped read tools for projects/tasks/employees. No raw database query, shell execution or unrestricted provider-selected tool names.

Exit criteria: allowed reads return only requester-scoped data; malformed/unknown/forbidden tool calls are rejected; both success and failure have durable traceable audit records; tools cannot bypass route-only permissions.

## 6. Deliver the first read-only AI workflow

Current classification: **Not implemented**. Depends on milestones 2, 4 and 5.

- Implement provider interfaces with a clearly labelled deterministic test adapter and a real LLM adapter; secrets remain server-side.
- Add goal intake, structured plan schema, tool/argument validation, persisted workflow state and execution limits/timeouts/cancellation.
- Deliver one bounded goal: summarize overdue work within the requester's scope. Return source-linked results and distinguish proposed plans from completed actions.
- Record provider/model, token usage and estimated cost; add admin daily usage visibility and budget enforcement before unrestricted usage.
- Test malformed responses, prompt injection in data, authorization attempts, provider timeout/rate limit and insufficient budget.

Exit criteria: goal → validated read-only plan → authorized tools → evidence-backed result → durable audit works end-to-end. No write tool is reachable in this milestone, and the UI accurately reflects that scope.

## 7. Add approvals, backup, execution and verification

Current classification: **Not implemented**. Depends on a proven read-only pipeline and audit foundation.

- Implement deterministic risk policy using action sensitivity, scope and reversibility; persist the policy version and decision.
- Generate exact previews and require authorized approval/rejection when policy demands it. Bind approval to an immutable plan and record versions; reject stale, expired or replayed approvals.
- Persist backups/manifests before applicable writes; test restore, access controls and retention. A backup failure must prevent the protected write.
- Add one narrowly scoped mutating tool, such as assigning a task to an eligible member. Revalidate authorization and record state immediately before execution.
- Implement idempotency, concurrency checks, bounded retries, partial-failure states and recovery guidance. Persist workflow progress across restarts.
- Independently re-read results, compare intended and actual changes, record verification failure, and produce an accurate final report linked to approval/backup/audit records.

Exit criteria: goal → plan → risk → approval when required → backup when required → controlled write → independent verification → audit passes. Negative tests prove no unauthorized write, no protected execution after approval/backup failure, no duplicate execution after retry, and visible handling of partial failure. Only then enable mutating agent actions in the UI.

## 8. Extend operational modules and integrations

Current classification: **Not implemented**. Implement incrementally after core safety contracts are established.

| Capability | Prerequisites | Completion criteria |
|---|---|---|
| Bug/client issue/ticket tracking | Identity, project ownership, audit | Domain models/APIs/UI and scoped lifecycle tests |
| Email intake and outbound messages | Ticket model, adapter contract, safe external-action policy | Authenticated provider integration, deduplication, retries and delivery evidence |
| WhatsApp intake/outbound | Message normalization, same authorization/audit policy | Verified webhook signatures, duplicate protection and delivery state |
| Message-to-task automation | Ticket/message modules and safe workflow | Traceable source message → authorized task, with duplicate/abuse handling |
| Reminders and escalation | Proven overdue semantics and messaging | Restart-safe scheduler, idempotent delivery, controlled escalation rules |
| AWS usage and costs | Least-privilege provider integration | Real retrieval, freshness indicators, error handling and scoped views |
| AI costs/credits/reporting expansion | Initial accounting from milestone 6 | Daily provider/model/user totals, budget reconciliation and alerts |
| Management reports and persisted notifications | Trusted scoped data and audit | Correct source-linked reports and real delivery/read state |
| Inventory/customer/import tools | Explicit product scope and safe write pipeline | Validated imports, preview, approval/backup as required, verification and rollback tests |

## Completion policy

Do not reuse the handover's approximate 70%/65%/30%/55% estimates. Track each feature with the five audit classifications and attach evidence: source revision, command/browser scenario, role, isolated environment, outcome and remaining limitations. A placeholder page, dependency declaration or design document does not make a feature implemented. A passing mocked suite does not prove persistence or end-to-end safety.

The immediate next implementation package should address authorization/session integrity and onboarding correctness, after restoring the verification environment. This audit created documentation only; every milestone above remains proposed work for review.

## Phase 1 status — AI usage and cost tracking

Status: **Implemented and unit-verified; live provider and real-database verification remain unverified.**

- The existing Overdue Task Assistant now persists provider-reported prompt, completion, total, and cached prompt token counts with the authenticated user, provider, returned model, server/request correlation ID, provider request ID, and timestamp. It stores no prompt/task content or credentials.
- Provider request records use a unique provider/deduplication key. Usage fields remain null when the provider response does not provide them; cost remains null when usage, cached-token details, or exact model pricing is unavailable.
- Standard token rates are maintained for the exact `gpt-6-luna` model ID and versioned. The estimate uses the provider's reported token counts and cached-token count; it is not a billing statement.
- Authenticated `/api/ai-usage` analytics are scoped in the backend service: employees and team leads see only their own usage, managers see users linked to their employee profile by `Employee.managerId`, and admins see organization-wide usage. Reports provide daily/weekly/monthly UTC windows, trends, provider/model breakdowns, and visible-user rows.
- Frontend adds an AI Usage & Cost page and navigation entry with period filters, trend chart, provider/model breakdown, scoped people table, loading/error/empty states, and explicit unavailable values.
- Verification: focused unit tests passed (2 suites, 15 tests); backend lint/build and frontend lint/production build passed. The task route integration suite was attempted but blocked by sandbox `listen EPERM`; no real MongoDB aggregation or OpenAI request was run.

Known limitations: only exact `gpt-6-luna` standard-processing pricing is configured. Other models and provider tiers report cost as unavailable. Rates require periodic review against the provider's current pricing. Live provider usage, MongoDB index creation, aggregation compatibility, and real role-isolation queries have not been verified in this iteration.
