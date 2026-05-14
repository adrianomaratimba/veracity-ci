# Threat Model

## Project Overview

Veracity is a multi-tenant electoral survey SaaS built with a React/Vite frontend and a Node.js/Express backend backed by PostgreSQL and Drizzle ORM. It handles organization-scoped survey operations, interviewer tracking, audio uploads, analytics dashboards, public share links, email-based account recovery, Replit OIDC login, and native email/password login.

Production analysis should focus on the deployed app only. Mockup sandbox behavior is out of scope, `NODE_ENV=production` can be assumed in production, and TLS is provided by the platform.

## Assets

- **User accounts and sessions** — session cookies, Replit OIDC identities, password hashes, password-reset tokens, email-verification tokens, and internal user IDs. Compromise enables impersonation and tenant access.
- **Tenant-scoped survey data** — organizations, surveys, answers, analytics, geofencing assignments, interviewer activity, and public-report tokens. Cross-tenant disclosure would break the platform’s core isolation guarantee.
- **Sensitive field-work evidence** — audio recordings, GPS/location history, geofence violations, and chat data. This data is privacy-sensitive and can expose respondents, interviewers, and organizational operations.
- **Administrative controls** — platform-admin actions, member role management, domain management, and plan management. Abuse here could affect all tenants.
- **Application secrets and external-service credentials** — session secret, database credentials, Twilio, SendGrid/Resend, VAPID keys, and Replit auth configuration.

## Trust Boundaries

- **Browser/PWA to Express API** — all client input is untrusted, including uploaded object references, auth flows, query params, and org IDs embedded in routes.
- **Express API to PostgreSQL** — the server has broad database access, so broken authorization or injection at the API layer can expose or modify tenant data.
- **Express API to object storage** — uploaded media and attachments cross from authenticated users into storage and may later be served back to clients. Access control must be enforced separately from upload.
- **Authenticated user to tenant-scoped resources** — users belong to different organizations and roles. Server-side checks must prevent horizontal and vertical privilege escalation.
- **Tenant admin to platform admin** — organization-level admins must never gain access to platform-wide administration or other tenants’ data.
- **Server to third-party services** — Replit OIDC, Twilio, SendGrid/Resend, and web push services are trusted only after explicit server-side validation and controlled data handling.
- **Public to share-link/report surfaces** — public report tokens and any publicly served objects cross from trusted internal data to unauthenticated readers and therefore need strong secrecy and scoping.

## Scan Anchors

- **Production entry points:** `server/index.ts`, `server/routes.ts`, `server/replit_integrations/auth/*`, `server/replit_integrations/object_storage/*`.
- **Highest-risk areas:** auth/session handling, password reset and invitation flows, org access middleware, public-report token routes, file/object upload and download paths, platform-admin routes, analytics/export endpoints, messaging and GPS/audio access.
- **Public surfaces:** `/api/auth/*`, `/api/public/:token`, `/api/plans`, `/api/uploads/request-url`, `/objects/*`, landing pages.
- **Authenticated/org-scoped surfaces:** most `/api/organizations/*`, `/api/surveys/*`, `/api/members/*`, tracking, analytics, geofencing, messages.
- **Platform-admin surfaces:** `/api/admin/*`, plan and landing configuration management.
- **Usually dev-only / low-priority for production scans:** `.local/`, scripts, local task files, Vite dev-server helpers, mockup-only assets unless a production route reaches them.

## Threat Categories

### Spoofing

The application supports both Replit OIDC and native session-based login. Every protected endpoint must accept only a valid server-side session and must resolve authenticated identities to the correct internal user record before performing database operations. Password-reset and email-verification flows must use unguessable, single-use, expiring tokens and must never leak those tokens through client responses or logs. Any privilege decision based on an email allowlist, especially platform-admin access, must be bound to a verified identity and not just a self-asserted unverified email address.

### Tampering

Clients can submit surveys, GPS updates, geofence data, zone assignments, public-link metadata, and member-management actions. The server must validate all request bodies and derive sensitive state from trusted server-side data. Client-supplied org IDs, survey IDs, user IDs, file paths, and upload metadata must not let a caller modify another tenant’s data or protected files.

### Information Disclosure

This application stores highly sensitive survey content, GPS trails, chat messages, audio, account data, and platform administration data. Responses must expose only the minimum fields each role needs, object storage access must not reveal private uploads without authorization, and logs must not capture password hashes, reset/setup tokens, private media paths, or other tenant-sensitive content.

### Denial of Service

Public auth endpoints, upload endpoints, and report surfaces can be targeted without a trusted user context. These surfaces must enforce rate limits, size constraints, and safe handling of expensive operations. Unauthenticated file-upload or file-serving paths are especially sensitive because they can consume storage, bandwidth, and downstream processing capacity.

### Elevation of Privilege

The main application risk is broken multi-tenant authorization: any authenticated user might try to access another organization’s surveys, responses, GPS data, settings, or public-link management by changing IDs. Platform-admin actions must remain restricted to explicitly allowlisted, verified platform admins. Role-management endpoints must prevent lower roles from escalating themselves or managing users outside their allowed hierarchy. File/object access must not bypass normal org or role checks.