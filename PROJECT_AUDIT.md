# FlowPilot AI — Project audit

Audit date: 2 November 2026 (Asia/Kolkata). Scope: `/Users/franksawaf/Downloads/flowpilot-ai 3`.

## Executive assessment

This copy contains a substantial React/Express/Mongoose CRUD application: authentication, employees, projects, tasks, dashboard API composition, reusable UI, and backend test suites. It does **not** contain an executable AI agent, planner, tool registry, risk engine, approval system, backup/restore pipeline, execution verification, or persistent business audit trail. The AI and integration directories contain README specifications and placeholders only.

No application feature qualifies as **Implemented and verified** at runtime in this audit. Source inspection establishes implementation presence and several defects; it does not establish successful builds, database persistence, browser behavior, or production readiness. Earlier handover results and completion percentages cannot be transferred to this copy.

## Scope, evidence, and limitations

- Read `HANDOVER.md` completely and inspected project documentation, source inventory, frontend pages/components/API clients, backend routes/controllers/services/models/middleware, configuration, package scripts, and test structure.
- The supplied workspace differs from the handover's `~/Downloads/flowpilot-ai` path. It has no `.git` directory; `git status --short` returned “not a git repository.” Branch, commit, upstream parity, and whether this is the latest copy are unverified. No remote repository was fetched.
- Neither frontend nor backend has `node_modules`. Only `.env.example` files are present; no local `.env` was found. Environment variable names were inspected without printing credential values. Shell-provided configuration and external infrastructure were not verified.
- Node is `v20.20.2`; npm is `10.8.2`. No dependencies were installed, no server or seed script was started, and no database or external provider was contacted or mutated.
- No existing source, environment, configuration, or package file was changed. Only this report and `ROADMAP.md` were created. No commit, push, or deployment occurred.
- Static frontend local import resolution found no missing targets. This is a limited filesystem check, not a TypeScript build.
- Findings below are source-level conclusions unless explicitly described as execution results. Proposed reproductions are future tests, not claims that live requests were executed.

## Verification results

| Directory | Command | Observed result | Classification |
|---|---|---|---|
| backend | `npm run lint` | Exit 127: `eslint: command not found` | Blocked |
| backend | `npm run build` | Exit 127: `tsc: command not found` | Blocked |
| backend | `npm test` | Exit 127: `jest: command not found` | Blocked |
| frontend | `npm run lint` | Exit 127: `eslint: command not found` | Blocked |
| frontend | `npm run build` | Exit 127: `tsc: command not found`; Vite never ran | Blocked |
| frontend | Tests | No `test` script or frontend test suite found | Not implemented |
| Full stack | Browser, MongoDB, session, role lifecycle, CRUD persistence | Not executed; dependency/configuration prerequisites absent in this copy | Blocked |

These are tooling blockers, not evidence of lint violations or compilation errors. There are no fresh passing test counts, coverage measurements, bundle measurements, or health-check results to report.

Backend contains six unit test files (password, JWT, RBAC, employee/project/task services) and four route test files (auth, employees, projects, tasks). Route tests mock their services; service tests mock Mongoose models. They exercise useful boundaries but do not establish real MongoDB aggregation/population/index behavior, refresh-token persistence, transactions, or browser integration. Auth route tests do not exercise a successful real refresh rotation. No auth-service test file, real-database suite, CI workflow, or browser E2E suite was found.

## Classification rules

- **Implemented and verified:** relevant behavior passed an executed check in this audit. No end-user application feature meets this threshold here.
- **Implemented but unverified:** substantive implementation exists, but relevant runtime checks could not run.
- **Partially implemented:** meaningful code exists but known defects or missing portions prevent completion.
- **Not implemented:** only design, placeholders, configuration, or no implementation exists.
- **Blocked:** a verification or delivery activity cannot proceed with this copy's available prerequisites. This does not imply its underlying source is absent.

## Feature inventory

| Feature | Classification | Evidence / limits |
|---|---|---|
| Public homepage, login/register screens, lazy routing | Implemented but unverified | `frontend/src/App.tsx`, `pages/HomePage.tsx`, `LoginPage.tsx`, `RegisterPage.tsx` |
| App shell, role-aware navigation, responsive tables/cards | Implemented but unverified | `layouts/`, employee/project/task pages; no browser verification |
| Shared forms, dialogs, alerts, toasts, skeletons, error boundary | Implemented but unverified | `components/ui/`, `components/ErrorBoundary.tsx`; accessibility needs runtime review |
| Loading, empty, error, success and retry flows | Partially implemented | Broad support; picker failures and stale-detail handling have gaps (F09, F11) |
| Dashboard counts/status breakdown/recent and overdue tasks | Implemented but unverified | `features/dashboard/dashboardApi.ts` composes actual CRUD APIs; uses per-status counts beyond 100 records |
| System status page and API health | Implemented but unverified | `/api/health` returns timestamp and Mongoose state; HTTP 200 even if database disconnected |
| Settings and profile | Partially implemented | Profile display and session-local sidebar preference exist; account editing and persistent preferences absent |
| Express server, Mongo connection, graceful shutdown | Implemented but unverified | `backend/src/app.ts`, `server.ts`, `config/database.ts`; server connects before listening |
| Request validation, response envelope, error handling | Partially implemented | Explicit validation/allowlists present; raw database validation/duplicate errors become 500; some filters lack type validation |
| Helmet, credentialed CORS, auth/global rate limits | Implemented but unverified | App and auth middleware; deployment-origin behavior untested |
| Registration and password hashing | Implemented but unverified | Registration explicitly creates EMPLOYEE; bcrypt/hash utilities and safe user serialization exist |
| Login and access tokens | Implemented but unverified | Password comparison, inactive-account check, signed access JWT, in-memory frontend token |
| Refresh sessions and browser bootstrap | Partially implemented | Hashed token storage and httpOnly cookie exist; collision/concurrency/retry defects (F03–F05) |
| Logout and deactivation/session revocation | Partially implemented | Refresh logout exists; old access tokens continue until expiry (F04); failed logout can leave cookie usable |
| ADMIN/MANAGER/EMPLOYEE/TEAM_LEAD RBAC | Partially implemented | Four roles exist, unlike three-role handover summary; employee authorization gaps (F01–F02) |
| User search, admin account provisioning and role changes | Not implemented | No users/admin role-management routes or UI; registration plus admin seed is not a complete lifecycle |
| Password reset/change, email verification, MFA | Not implemented | No routes or service implementations |
| Admin seeding | Partially implemented | Environment-driven script exists; existing non-admin account is incorrectly reported as an existing admin (F12) |
| Employee create/list/detail/edit/status and own profile | Partially implemented | Full vertical slice exists, but access and consistency issues remain |
| Employee ID generation and account linking | Partially implemented | Mongo ObjectIds automatic; human employee ID manually required; raw existing user ID entered in UI |
| Employee manager assignment | Partially implemented | Backend reference field/update exists; no form control; role/active/cycle validation incomplete |
| Project create/list/detail/edit/status/deactivate | Partially implemented | Backend and UI present; deadline clearing and lifecycle gaps (F06, F08) |
| Project visibility and manager ownership | Implemented but unverified | List/detail/write scoping in `services/projectService.ts`; tests are mocked |
| Project manager reassignment and membership | Partially implemented | API and UI exist; raw manager user ID, inactive-manager check and removal lifecycle gaps |
| Project progress | Partially implemented | Explicitly labelled status-derived estimate; no task-derived progress |
| Project reactivation | Not implemented | No reactivation endpoint or UI |
| Task create/list/detail/update/assign/status/delete | Implemented but unverified | Shared PATCH for edits, assignment and status; populated responses used by UI |
| Task visibility, allowed assignee fields/status transitions | Implemented but unverified | Admin/project manager/assignee rules in `taskService.ts`; assignee cannot complete work |
| Task filters, pagination, tags, due/overdue logic | Implemented but unverified | URL-based frontend filters and backend filtering; calendar-day semantics need product confirmation |
| Task lifecycle after member removal/project deactivation | Partially implemented | Existing access and mutation remain possible; no consistent lifecycle policy (F08) |
| Project/employee selection at scale | Partially implemented | Task selectors stop at first 100; employee picker only eight results before local exclusions |
| Frontend-to-backend REST integration | Implemented but unverified | Client methods match mounted routes/envelopes on static inspection; no live contract verification |
| Bug/issue and client-ticket modules | Not implemented | No models/services/routes/pages implementing these domains |
| Message-to-ticket/task ingestion | Not implemented | No inbound message model/webhooks/normalizer |
| Reminders, escalation, scheduler, notifications | Not implemented | `jobs/README.md` only; UI toasts are not persisted notifications |
| AI goal intake/conversation | Not implemented | Disabled textarea and planned page only |
| LLM provider adapters, including mock provider | Not implemented | Config defaults and provider README do not implement an adapter |
| AI structured planning and plan validation | Not implemented | Planner README only |
| Typed authorized AI tool registry | Not implemented | Tool README only; CRUD services are prerequisites, not tools |
| Risk scoring and previews | Not implemented | Safety README only |
| Human approval/rejection and workflow RBAC | Not implemented | Planned page; no approval model, API or state machine |
| Backup before execution and restore/rollback | Not implemented | S3 dependency/config/README only |
| Controlled execution, retries, idempotency, cancellation | Not implemented | No orchestrator implementation or persisted execution state |
| Post-execution verification and agent reporting | Not implemented | Design only |
| Durable action audit log/history | Not implemented | Console application/access logs only; no audit collection, API or change history |
| AI provider usage, daily credits/cost and limits | Not implemented | No usage model, accounting service or dashboard |
| AWS usage/cost integration | Not implemented | README/config only; no Cost Explorer adapter |
| Email and WhatsApp integrations, real or mock | Not implemented | README/config only; no send/receive adapters or webhooks |
| Generated management reports, inventory/import/customer tools | Not implemented | Mentioned in design/tool list only |
| Build/lint/backend tests on current source | Blocked | Dependencies absent; all available commands attempted |
| Full-stack persistence/RBAC/browser verification | Blocked | Local prerequisites absent; no safe test environment established |
| Automated frontend/E2E/real-DB verification and CI | Not implemented | No corresponding harness or pipeline found |

## API and permission inventory

All paths below are under `/api`; permissions describe the current source, including gaps, not an endorsed policy.

| Area | Mounted operations | Current rules |
|---|---|---|
| Health | `GET /health` | Public |
| Auth | `POST /auth/register`, `/login`, `/refresh`, `/logout`; `GET /auth/me` | Register/login public; refresh/logout use cookie; me uses access JWT |
| Employees | `POST /employees`; `GET /employees`, `/employees/me`, `/employees/:id`; `PATCH /employees/:id`, `/employees/:id/status` | Admin create/status; admin/manager list/edit; detail blocks other EMPLOYEE records but misses TEAM_LEAD |
| Projects | `POST /projects`; `GET /projects`, `/projects/:id`; `PATCH /projects/:id`, `/:id/status`, `/:id/manager`, `/:id/deactivate`; `POST /projects/:id/members`; `DELETE /projects/:id/members/:employeeId` | Admin create/reassign/deactivate; admin/own manager edits/membership; others read member projects |
| Tasks | `POST /tasks`; `GET /tasks`, `/tasks/:id`; `PATCH /tasks/:id`; `DELETE /tasks/:id` | Admin/own manager create/manage/delete; assignee read and limited edits; only admin deletes completed tasks |

`taskService.assignTask` and `updateTaskStatus` are service functions, not separate mounted endpoints; frontend correctly uses PATCH `/tasks/:id`. No operational routes are mounted for AI, approvals, integrations, costs, reports, or audit logs.

Employee `managerId` references an **Employee**, project `managerId` references a **User**, project `members` and task `assignedTo` reference **Employees**. Task `createdBy` references a **User**. This distinction is deliberate in schemas but makes manual-ID onboarding error-prone.

## Findings and recommended verification

### F01 — High: TEAM_LEAD can read unrelated employee details

`backend/src/services/employeeService.ts:162` checks ownership only when role equals EMPLOYEE. `GET /employees/:id` has authentication but no role allowlist. An authenticated TEAM_LEAD with another employee's ID bypasses the ownership restriction and receives that employee record and public user details. Frontend route hiding does not prevent direct requests. Add an explicit policy for every role and test unrelated TEAM_LEAD access returns 403. Source-confirmed; not exercised against a live API.

### F02 — High: manager employee scope is broader than the handover

`employee.routes.ts` permits any MANAGER to list/edit employees; `getEmployees` and `updateEmployee` do not receive requester identity. Managers can edit unrelated employees, including reporting-manager relationships. Existing tests explicitly allow managers to view any employee, so this is a confirmed implementation-versus-handover mismatch, not an accidental failure of the current tests. Define team scope and enforce it in services; test across two unrelated teams.

### F03 — High: refresh tokens can collide and rotation is not atomic

`backend/src/utils/jwt.ts:29` signs refresh tokens using only user ID, type, and time-based JWT claims; there is no random `jti`. Issuance for the same user in the same second can produce identical tokens. `RefreshToken.tokenHash` is unique. Rapid logins or immediate refresh can therefore hit a duplicate-key error; refresh has already revoked the old token before replacement issuance.

Separately, `authService.ts:108–122` reads, checks, saves revocation and issues a replacement in separate operations. Concurrent requests can both pass the initial check; the comment describing a single operation is inaccurate. Introduce unique token IDs and atomic single-use consumption/rotation with failure handling. Verify same-second issuance, concurrent refresh, replay, and replacement-write failure against real indexes.

### F04 — High: deactivation does not immediately revoke API access

`middleware/auth.ts` trusts the JWT role without reading current user status/session state. Deactivation updates User/Employee, and login/refresh reject inactive users, but already-issued access tokens remain usable on CRUD endpoints until expiry (default 15 minutes). Logout revokes only the presented refresh token. Treat this as a documented revocation gap and choose an explicit immediate-revocation policy; verify previously issued tokens after deactivation/logout/role change.

### F05 — Medium: bootstrap bypasses refresh deduplication

`authApi.refreshSessionRequest` calls the intercepted `apiClient`, while its 401 handler excludes login/register but not refresh. A failed bootstrap refresh therefore triggers another refresh attempt. `useAuthBootstrap` calls refresh directly, outside `refreshInFlight`; React StrictMode in `main.tsx` can launch duplicate development bootstrap requests. Cleanup ignores a response but does not cancel token rotation on the server. Combined with F03, session restoration is unreliable under concurrency. Unify refresh handling and verify reload, expired cookie, parallel 401s, StrictMode and multi-tab behavior.

### F06 — Medium: project deadline cannot be cleared reliably

`frontend/src/features/projects/EditProjectModal.tsx:51` converts an empty date to `undefined`; JSON omits it, leaving the existing deadline unchanged while reporting success. Backend `projectService.ts:256` uses `updates.deadline ?? project.deadline`, so explicit null is treated as the old date during validation. Clearing the deadline while moving startDate beyond the old deadline can be rejected incorrectly. Use distinct omitted/null semantics; test both UI clearing and combined start-date/clear updates.

### F07 — Medium: account onboarding and manager lifecycle are incomplete

Registration creates only a User; employee creation requires a manually supplied existing user ObjectId and employee code. No user search, admin role assignment, or human-ID generator exists. Employee manager references check existence but not manager role, active status, or multi-record cycles; the UI does not expose manager assignment. Project manager validation selects `role` but does not reject inactive users. Complete and verify the account → employee → manager → project → task lifecycle.

### F08 — Medium: cross-record lifecycle consistency is incomplete

`updateEmployeeStatus` saves Employee and updates User separately without a transaction. Failure can leave active states inconsistent. `projectService.removeMember` removes membership without reconciling task assignments; `taskService.resolveAccess` still authorizes the removed assignee. Inactive projects reject new tasks, but existing task edits/assignments and project changes do not uniformly enforce inactivity. These behaviors are source-confirmed; whether archived work should remain editable requires a product policy. Test failure recovery and removal/deactivation scenarios before declaring lifecycle completion.

### F09 — Medium: selectors hide errors and omit valid options

`features/tasks/hooks.ts:14,25` loads only the first 100 projects/employees. Projects outside that page cannot be chosen through the task form. `EmployeePicker.tsx:29` turns request failures into an empty list and fetches only eight records before excluding existing members, potentially showing no matches while more eligible people exist. `TaskFormModal` ignores the assignee-loading error. Add searchable/paginated selectors and visible retry states; test >100 records and API failure.

### F10 — High prerequisite for AI: services are not a universal authorization boundary

Some operations rely on route-only checks: employee create/update/status and project create/manager reassignment/deactivation do not consistently authorize a requester inside the service. Calling these from future tools would bypass the current HTTP allowlists unless the tools repeat the checks correctly. There is also no durable action audit log. The architecture's claims that every service write is authorized and audit-logged are not true today. Establish a shared authorized service/tool contract and audit trail before enabling AI mutations.

### F11 — Medium: stale results can obscure failed navigation/refresh

`useAsyncData` retains previous data when a fetcher changes or a request fails. Detail pages return their error state only when data is absent. Navigating between same-route detail IDs can temporarily display the previous record and continue showing it after a 403/404; mutation controls use the displayed record or current route ID depending on the page. This does not bypass backend permissions, but can mislead the user about the record being edited. `SystemStatusPage` likewise retains an old Operational badge after a failed recheck (alongside an error alert). Key/reset detail data by identity and label stale status; verify slow navigation and failures.

### F12 — Medium: seed script does not verify an existing account is ADMIN

`scripts/seedAdmin.ts` returns success for any existing matching email without checking role or active status. An existing EMPLOYEE account can leave initial admin setup incomplete while logs say an admin already exists. Fail clearly on incompatible accounts; do not silently promote users. Script was inspected, not executed.

### F13 — Medium: database errors and filter validation need hardening

`errorHandler.ts` maps only AppError explicitly. Concurrent unique-key conflicts and Mongoose validation errors become 500 instead of actionable 409/422. Employee department/designation/search and project search lack scalar-string validation before service use; TypeScript casts in controllers do not sanitize runtime query objects. Add runtime validation and explicit database error mapping; test duplicate races, object/array query parameters and schema validation failures. No exploit was executed.

### F14 — Low/medium: frontend behavior needs focused QA

Mobile navigation declares an aria-modal dialog but lacks the focus trapping/restoration and scroll lock provided by the reusable Modal. Modal close controls remain active during writes, risking accidental dismissal while a request completes. Project reassignment closes its form after `run()` even when that helper catches a failure. Failed logout clears local state without reporting server revocation failure; a surviving refresh cookie can restore the session later. Task due dates are described as calendar dates but overdue comparisons begin at stored noon UTC; confirm the intended business deadline. Verify keyboard, mobile, network failure, slow mutation and date-boundary behavior.

## What is completed versus what is working

Completed **as source deliverables**: the layered CRUD foundation; five persisted model definitions (User, RefreshToken, Employee, Project, Task); auth/employee/project/task controllers and routes; project/task ownership rules; role-aware React screens; actual REST client wiring; dashboard aggregation; shared UI; and ten backend test files.

Working **by execution evidence in this audit**: Node/npm invocation and the limited frontend import-target check. No application endpoint, browser flow, database write, build, lint run or Jest suite was successfully executed. This distinction is essential: “implemented” is not a claim of end-to-end correctness.

Incomplete/broken: the specific source findings above, full user/role onboarding, robust sessions and lifecycle rules, scalable selectors and error states, automated real-database/browser testing, and all agentic/integration functionality.

Documentation drift: root README still describes Phase 1 without a database; current server connects MongoDB. Architecture describes mock adapters and audit logging as existing although neither is implemented. Handover references another directory, prior local environment files, ports and a legacy Modal path; current employee modals use `components/ui/Modal`. Current defaults are backend 5000 and frontend 5173, not evidence of the earlier 5001/5174 runtime. Do not overwrite configuration based on old notes.

## Recommended next action

Review this audit, establish an isolated reproducible verification environment, fix F01–F05 and the service authorization boundary, complete user/role onboarding and lifecycle consistency, then prove CRUD flows with real database and browser tests. Build a read-only AI vertical slice next; introduce mutating tools only after audit logging, approval, backup, idempotency and verification gates exist. See `ROADMAP.md` for concrete completion criteria. No implementation changes have been made.
