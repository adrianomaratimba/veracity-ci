# Objective
Run an in-depth production-scope security scan across the entire project and report only confirmed, exploitable vulnerabilities.

# Relevant information
- Production entry points: `server/index.ts`, `server/routes.ts`, `server/replit_integrations/auth/*`, `server/replit_integrations/object_storage/*`.
- Core trust boundaries: browser/PWA -> Express API, API -> PostgreSQL, API -> object storage, authenticated user -> tenant-scoped data, tenant admin -> platform admin, public -> share-link/object routes.
- Production-only assumptions from threat model apply. Ignore dev-only helpers unless production reachability is shown.
- Confirmed early leads:
  - Generic object storage routes are mounted without auth or ACL checks.
  - Some auth/member responses appear to expose full `users` rows and may leak password hashes or tokens.
  - Global API logging captures full JSON responses and may log sensitive fields.

# Tasks

### T001: Auth and sensitive-data exposure
- **Blocked By**: []
- **Details**:
  - Validate whether auth/session, member, invitation, and account-recovery routes leak password hashes, reset/setup tokens, or other high-value secrets.
  - Inspect `server/replit_integrations/auth/*`, `server/auth-service.ts`, `server/index.ts`, `server/routes.ts`, `server/storage.ts`, `shared/models/auth.ts`, `shared/routes.ts`.
  - Acceptance: Confirm or reject direct credential/token exposure with concrete route and field evidence.

### T002: Object storage and upload/download surface
- **Blocked By**: []
- **Details**:
  - Validate exploitability of `/api/uploads/request-url` and `/objects/*`, including anonymous upload, unauthorized file read, and production impact.
  - Inspect `server/replit_integrations/object_storage/*`, upload consumers in client/server code, and any references to stored media paths.
  - Acceptance: Confirm whether public callers can upload arbitrary files or fetch private files without org/role checks.

### T003: Multi-tenant and role-based access control
- **Blocked By**: []
- **Details**:
  - Review org-scoped endpoints for missing `requireOrgAccess`, inconsistent role checks, or IDOR patterns in surveys, responses, analytics, messages, geofencing, and tracking.
  - Inspect `server/routes.ts`, `server/middleware/org-access.ts`, `shared/rbac.ts`, and relevant storage methods.
  - Acceptance: Confirm any route where a user can access or mutate data outside allowed org/role scope.

### T004: Public/share and admin boundary review
- **Blocked By**: []
- **Details**:
  - Review public-link endpoints, platform-admin checks, landing config, and any unauthenticated/public reporting surface for secret leakage or broken scoping.
  - Inspect `server/routes.ts`, `client/src/App.tsx`, and report-related client pages.
  - Acceptance: Confirm any public or admin-boundary weakness beyond intended public sharing behavior.
