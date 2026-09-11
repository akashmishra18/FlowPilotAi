# AI Tools

Controlled, typed functions the agent is allowed to call (Phase 6+):
getTasks, getOverdueTasks, createTask, updateTask, createBug, updateBug,
assignTask, getEmployees, getProjectData, createCustomer, updateInventory,
importData, sendReminder, generateReport, getAIUsage, getAWSUsage.

Rules:
- Every tool calls into `services/`, never into `models/` directly.
- Every tool validates its own arguments (even if the planner already did).
- Every tool call is authorized against the requesting user's role.
- Every tool call is logged to the audit log, success or failure.
