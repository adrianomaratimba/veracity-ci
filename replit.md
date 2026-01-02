# VotoAudit - Electoral Survey Platform

## Overview

VotoAudit is a multi-tenant SaaS platform for managing electoral surveys with anti-fraud capabilities. The platform enables organizations to conduct professional electoral research with GPS tracking, audio recording verification, and comprehensive analytics dashboards. Built for LGPD compliance and designed to match the quality standards of major polling institutions like IBOPE/Datafolha.

Key capabilities:
- Multi-tenant organization management with subscription plans (Basic, Pro, Enterprise)
- Survey creation and field data collection via PWA for interviewers
- Anti-fraud measures including mandatory GPS capture and audio recording
- Role-based access control (Owner, Admin, Coordinator, Interviewer, Viewer)
- Real-time analytics dashboards with map visualization

## User Preferences

Preferred communication style: Simple, everyday language.

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
- **Auth Provider**: Replit Auth (OIDC-based)
- **Session Storage**: PostgreSQL with 7-day TTL
- **RBAC Roles**: proprietario (owner), admin, coordenador, entrevistador, visualizador
- **Tenant Isolation**: All data queries filtered by organization_id

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