# Veracity - Electoral Survey Platform

## Overview

Veracity is a multi-tenant SaaS platform designed for managing electoral surveys with robust anti-fraud capabilities, including GPS tracking and audio recording verification. It aims to provide comprehensive analytics dashboards and ensure LGPD compliance, meeting high-quality standards for professional electoral research. The platform supports multi-tenant organization management with various subscription plans, survey creation, field data collection via a PWA for interviewers, and role-based access control. Key features include real-time analytics with map visualization, geofencing for zone validation, and web push notifications for supervisors regarding interviewer activities.

## User Preferences

Preferred communication style: Simple, everyday language.

### Deployment Preference
- **Always publish after changes**: User prefers that code changes be deployed to production immediately after implementation
- **Note**: Database changes (data inserts, updates) cannot be synced automatically - production and development databases are separate

### Language Convention
- **UI/Interface**: Portuguese (Brazil) - all user-facing text in Portuguese
- **Internal Code**: English - all database values, enums, variable names, queries
- **Translation Layer**: `shared/i18n/labels.ts` provides mappings from English values to Portuguese labels

## System Architecture

### Frontend Architecture
The frontend is built with React 18 and TypeScript, using Wouter for routing and TanStack Query for server state management. UI components are sourced from shadcn/ui (based on Radix UI), styled with Tailwind CSS for a professional navy/slate palette. Vite is used as the build tool. Key libraries include Recharts for data visualization, React-Leaflet for maps, Framer Motion for animations, and Uppy for file uploads.

### Backend Architecture
The backend is a Node.js application using Express, written in TypeScript with ES modules. It features RESTful API endpoints with Zod schema validation. Authentication is handled via Replit Auth (OpenID Connect) with Passport.js, and session management is PostgreSQL-backed using connect-pg-simple.

### Data Storage
PostgreSQL is the primary database, managed with Drizzle ORM. The schema is defined in `shared/schema.ts`. Google Cloud Storage is integrated for object storage of file uploads like audio recordings and attachments. Key tables include organizations, surveys, responses, and users.

### Authentication & Authorization
The system supports both Replit Auth (OIDC-based) and native email/password authentication. Native auth includes bcrypt hashing, email verification, and password reset. A robust Role-Based Access Control (RBAC) system, defined in `shared/rbac.ts`, enforces permissions for roles like Owner, Admin, Coordinator, Interviewer, and Viewer. All data queries are tenant-isolated by `organization_id`.

### Project Structure
The project is organized into `client/` (React frontend), `server/` (Express backend), `shared/` (common types, schemas, and routes), and `migrations/` (Drizzle migration files). An API contract pattern using `shared/routes.ts` ensures type-safe API calls.

### SaaS Features
- **Subscription Plans**: Configurable basic, professional, and enterprise plans with varying limits on surveys, interviews, and users. Plans are stored dynamically in the database.
- **White Label**: Organizations can customize branding with custom logos, color schemes, and domain names.
- **Custom Domains**: Supports automatic subdomains and custom domains for Enterprise plans, with DNS verification.
- **Geofencing**: Allows defining polygon-based geographical zones for surveys. Interviewers receive real-time alerts and push notifications when they exit designated areas, with an optional blocking mode to prevent data collection outside the zone. Violations are logged.
- **Messaging System**: Provides real-time chat between supervisors/coordinators and interviewers, including push notifications for new messages.

## External Dependencies

### Cloud Services
- **Replit Auth**: OpenID Connect authentication.
- **Google Cloud Storage**: Object storage for files.
- **PostgreSQL**: Primary database.
- **SendGrid**: Email delivery for password resets and welcome emails, with Resend as a fallback.

### Key NPM Packages
- **drizzle-orm** / **drizzle-kit**: ORM and migrations.
- **@tanstack/react-query**: Server state management.
- **zod**: Runtime schema validation.
- **passport** / **openid-client**: Authentication.
- **@uppy/core** / **@uppy/aws-s3**: File uploads.
- **recharts**: Chart visualizations.
- **react-leaflet** / **leaflet**: Map visualizations.
- **express-session** / **connect-pg-simple**: Session management.

### Environment Variables Required
- `DATABASE_URL`
- `SESSION_SECRET`
- `ISSUER_URL`
- `REPL_ID`
- `PUBLIC_OBJECT_SEARCH_PATHS`
- `SENDGRID_API_KEY`
- `PLATFORM_ADMIN_EMAILS`
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_EMAIL`