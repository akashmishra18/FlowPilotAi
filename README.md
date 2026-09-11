# FlowPilot AI

## 1. What is FlowPilot AI?

FlowPilot AI is an **agentic AI-powered workflow and operations automation
platform**. It replaces manual tracking spreadsheets and scattered client
messages with a single system where work items, bugs, and client issues are
tracked automatically, and an AI agent can carry out multi-step operational
tasks on request — always through controlled, auditable tools, never through
direct, unrestricted database access.

## 2. Target Users

The initial target customer is a **game development company**, specifically:

- **Admins/Founders** — company-wide visibility, cost tracking, reports.
- **Managers** — project oversight, approvals for AI-driven bulk actions.
- **Team Leads** — task assignment, bug triage, team productivity.
- **Employees/Developers** — their own tasks, bugs, and assignments.

## 3. Main Features (full roadmap)

- Employee and role management
- Task creation and tracking
- Project / game development tracking
- Bug and issue management
- Client issue intake and tracking
- WhatsApp and Email integration for client communication
- Automatic ticket/task creation from inbound messages
- Reminders and escalation for unresolved issues
- Controlled AI-powered data entry and bulk updates
- AI/API token usage and cost tracking
- AWS/cloud usage and cost tracking
- Management reports, generated on request (e.g. "today's company summary")
- An **agentic AI assistant** that plans and executes multi-step workflows
  through a fixed set of validated tools, with human approval, automatic
  backups, and post-execution verification for risky actions

**Phase 1 (this phase) delivers only the project scaffold** — see
"What Was Implemented" below for the exact current scope.

## 4. Architecture

Full design rationale lives in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
Summary:

```
Frontend (React)  →  REST API (Express)  →  Service Layer  →  MongoDB
                                                  ↑
                                        AI Tool Registry (ai/tools/)
                                                  ↑
                                    Agent Orchestrator (plan → approve →
                                    backup → execute → verify → audit)
```

The AI agent never queries MongoDB or runs system commands directly. It can
only call a fixed set of validated, authorized, logged tool functions —
the same service layer the REST API itself uses. Every automated action
(human or AI-triggered) follows:

```
Goal → Understand → Plan → Select Tools → Fetch/Analyze → Safety Check
     → Human Approval (if required) → Backup (if required) → Execute
     → Verify → Report → Audit Log
```

## 5. Tech Stack

**Frontend:** React, TypeScript, Vite, Tailwind CSS, React Router, Axios,
Zustand, Lucide React, Recharts

**Backend:** Node.js, Express, TypeScript, Mongoose (added Phase 2), JWT +
bcrypt for auth (added Phase 2)

**AI:** LLM API + structured tool/function calling, custom planner/agent
layer (added Phase 6+) — no framework lock-in, adapter-based

**Cloud:** AWS S3 (backups, added Phase 8), AWS Cost Explorer (added
Phase 10), EC2 (deployment, added Phase 15)

## 6. Running the Backend

```bash
cd backend
cp .env.example .env      # placeholders only — fill in real values later
npm install
npm run dev                # http://localhost:5000
```

Other scripts: `npm run build` (compile TypeScript), `npm run lint`
(ESLint).

MongoDB is **not** connected in Phase 1 — `npm run dev` starts the HTTP
server with routing, middleware, and error handling only.

## 7. Running the Frontend

```bash
cd frontend
cp .env.example .env      # set VITE_API_BASE_URL if not using the default
npm install
npm run dev                # http://localhost:5173
```

Other scripts: `npm run build` (production build), `npm run lint`
(ESLint).

## 8. Testing the Health Endpoint

With the backend running:

```bash
curl http://localhost:5000/api/health
```

Expected response:

```json
{
  "success": true,
  "message": "FlowPilot API is running",
  "timestamp": "2026-09-11T05:00:00.000Z",
  "database": "not_connected_yet"
}
```

## 9. Project Structure

```
backend/    Node.js + Express + TypeScript API (service layer, AI agent
            layer scaffolded but not yet implemented)
frontend/   React + TypeScript + Tailwind dashboard shell
docs/       Architecture documentation
```

See the end of the Phase 1 implementation notes (or `docs/ARCHITECTURE.md`)
for the full intended folder tree and phase-by-phase roadmap.
