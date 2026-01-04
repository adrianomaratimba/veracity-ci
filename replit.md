# Veracity - Electoral Survey Platform

## Overview

Veracity is a multi-tenant SaaS platform for managing electoral surveys with anti-fraud capabilities. The platform enables organizations to conduct professional electoral research with GPS tracking, audio recording verification, and comprehensive analytics dashboards. Built for LGPD compliance and designed to match the quality standards of major polling institutions like IBOPE/Datafolha.

Key capabilities:
- Multi-tenant organization management with subscription plans (Basic, Pro, Enterprise)
- Survey creation and field data collection via PWA for interviewers
- Anti-fraud measures including mandatory GPS capture and audio recording
- Role-based access control (Owner, Admin, Coordinator, Interviewer, Viewer)
- Real-time analytics dashboards with map visualization

## User Preferences

Preferred communication style: Simple, everyday language.

### Language Convention
- **UI/Interface**: Portuguese (Brazil) - all user-facing text in Portuguese
- **Internal Code**: English - all database values, enums, variable names, queries
- **Translation Layer**: `shared/i18n/labels.ts` provides mappings from English values to Portuguese labels
  - Status: draft, active, paused, completed, archived
  - Question Types: single_choice, multiple_choice, text, number, scale, date, boolean
  - Survey Types: electoral, opinion, market, census
  - Roles: owner, admin, coordinator, interviewer, viewer

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight alternative to React Router)
- **State Management**: TanStack Query for server state, React hooks for local state
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with custom design tokens for a professional navy/slate palette
- **Build Tool**: Vite with React plugin
- **Key Libraries**: 
  - Recharts for data visualization
  - React-Leaflet for map displays
  - Framer Motion for animations
  - Uppy for file uploads

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript with ES modules
- **API Design**: RESTful endpoints with Zod schema validation
- **Authentication**: Replit Auth (OpenID Connect) with Passport.js
- **Session Management**: PostgreSQL-backed sessions via connect-pg-simple

### Data Storage
- **Database**: PostgreSQL via Drizzle ORM
- **Schema Location**: `shared/schema.ts` defines all tables
- **Object Storage**: Google Cloud Storage integration for file uploads (audio recordings, attachments)
- **Key Tables**: organizations, organization_members, surveys, questions, responses, answers, users, sessions

### Authentication & Authorization
- **Auth Providers**: Hybrid system supporting both:
  - Replit Auth (OIDC-based) for existing users
  - Native email/password authentication for public registration
- **Native Auth Features**:
  - Password hashing with bcrypt (12 salt rounds)
  - Email verification tokens
  - Password reset functionality
  - Auto-acceptance of pending invitations on registration/login
- **Member Addition Flow**:
  - Admins add members directly by email (no invitation emails)
  - Users are created with `authProvider='pending'` status
  - Users can complete setup via:
    1. Password reset flow (sets up password-based auth)
    2. Replit Auth login (links to their Replit account)
  - `replit_user_id` column maps Replit external IDs to internal UUIDs
- **Session Storage**: PostgreSQL with 7-day TTL
- **RBAC System** (`shared/rbac.ts`):
  - Roles: owner, admin, coordinator, interviewer, viewer (stored in English)
  - Permission matrix:
    - Owner/Admin: Full access (org:*, surveys:*, members:*, analytics:*)
    - Coordinator: Manage surveys and see analytics (surveys:*, analytics:view)
    - Interviewer: Submit responses only (responses:submit, surveys:view)
    - Viewer: Read-only access (surveys:view, analytics:view)
  - Middleware: `server/middleware/org-access.ts` enforces permissions
  - Users without organization see "Aguardando Acesso" page
- **Tenant Isolation**: All data queries filtered by organization_id
- **Key Auth Files**:
  - `server/auth-service.ts`: Native authentication service
  - `server/replit_integrations/auth/storage.ts`: Replit Auth user storage with identity mapping
  - `server/replit_integrations/auth/routes.ts`: Auth endpoints
  - `client/src/pages/auth.tsx`: Login/register UI

### Project Structure
```
client/           # React frontend application
  src/
    components/   # UI components (shadcn/ui + custom)
    hooks/        # React Query hooks for data fetching
    pages/        # Route components
    lib/          # Utilities
server/           # Express backend
  replit_integrations/  # Auth and object storage modules
shared/           # Shared types, schemas, and route definitions
  models/         # Database models
  schema.ts       # Drizzle schema definitions
  routes.ts       # API contract with Zod validation
migrations/       # Drizzle migration files
```

### API Contract Pattern
The `shared/routes.ts` file defines a typed API contract with:
- Path definitions with parameter placeholders
- Input/output Zod schemas
- HTTP method specifications
- This enables type-safe API calls from the frontend

## External Dependencies

### Cloud Services
- **Replit Auth**: OpenID Connect authentication provider
- **Google Cloud Storage**: Object storage for file uploads (audio recordings, documents)
- **PostgreSQL**: Primary database (provisioned via Replit)

### Key NPM Packages
- **drizzle-orm** / **drizzle-kit**: Database ORM and migrations
- **@tanstack/react-query**: Server state management
- **zod**: Runtime schema validation
- **passport** / **openid-client**: Authentication handling
- **@uppy/core** / **@uppy/aws-s3**: File upload management
- **recharts**: Chart visualizations
- **react-leaflet** / **leaflet**: Map visualizations
- **express-session** / **connect-pg-simple**: Session management

### Environment Variables Required
- `DATABASE_URL`: PostgreSQL connection string
- `SESSION_SECRET`: Secret for session encryption
- `ISSUER_URL`: OIDC issuer (defaults to Replit)
- `REPL_ID`: Replit deployment identifier
- `PUBLIC_OBJECT_SEARCH_PATHS`: Object storage paths configuration

## SaaS Features

### Subscription Plans
- **Básico**: 1 survey, 100 interviews/month, 5 users
- **Profissional**: Multiple surveys, 1000 interviews/month, 20 users
- **Enterprise**: Unlimited surveys, unlimited interviews, custom SLA

### White Label (Branding)
- Custom logo upload per organization (stored in object storage)
- Primary and secondary color customization
- Custom branding name to replace "Veracity"
- Option to hide Veracity branding entirely
- Settings page: `/org/:orgId/settings` -> "Marca" tab

### Custom Domains
- Automatic subdomain: `{org-slug}.veracity.app`
- Custom domain support (Enterprise plan) - schema ready, UI pending full implementation
- DNS verification and SSL provisioning (future)
- Database table: `organization_domains`

### Pending Implementations
- **Stripe Integration**: Payment processing for subscriptions is NOT yet configured. User declined Replit integration setup. When ready, configure Stripe API keys as secrets and implement:
  - Checkout sessions for new subscriptions
  - Webhook handlers for subscription events
  - Customer portal for self-service billing
  - Use fields: `stripeCustomerId`, `stripeSubscriptionId`, `billingStatus` in organizations table