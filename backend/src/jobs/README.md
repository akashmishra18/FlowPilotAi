# Scheduled Jobs

The backend starts the existing `node-cron` scheduler after MongoDB connects.
It checks due work every five minutes using `Asia/Kolkata`:

- Daily overdue reminder sweep after 09:00.
- Daily employee overdue summaries after 09:05.
- Weekly manager summaries after 09:10 each Monday.
- Monthly organization summaries after 09:15 on the first day of the month.

`ScheduledJobRun` uses a unique `(jobKey, periodKey)` index and an atomic claim
to coordinate multiple backend instances. Failed runs are retried on a later
tick; successful runs are not repeated during the period. Reminder and
notification records provide per-task and per-recipient deduplication. Each
run is audited and its result is persisted. Summary notifications state whether
the existing provider generated the summary or the rule-based fallback did.

Email is not attempted: the repository has no configured delivery adapter.
