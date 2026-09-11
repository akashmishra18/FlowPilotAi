# Controllers

Thin HTTP layer only: parse request, call a service, send response via
sendSuccess/sendError. No business logic here - that belongs in `services/`
so the AI tool layer can reuse it identically.
