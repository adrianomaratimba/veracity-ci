import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { useOrganizations, useCurrentMember } from "@/hooks/use-organizations";
import { useEffect, Component, type ReactNode } from "react";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { hasPermission, type UserRole, type Permission } from "@shared/rbac";

// Error Boundary to catch rendering errors
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: { componentStack: string }) {
    console.error("App Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
          <h1 className="text-2xl font-bold text-destructive mb-4">Algo deu errado</h1>
          <p className="text-muted-foreground mb-4">{this.state.error?.message}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md"
          >
            Recarregar página
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Route guard: redirects users without the required permission
function RequirePermission({ 
  orgId, 
  permission, 
  children, 
  fallback 
}: { 
  orgId: string | undefined; 
  permission: Permission; 
  children: ReactNode; 
  fallback?: string;
}) {
  const parsedOrgId = orgId ? parseInt(orgId) : 0;
  const { data: member, isLoading } = useCurrentMember(parsedOrgId);
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isLoading || !parsedOrgId) return;
    // member===null means the user has no membership yet (still loading or no org)
    if (member === null) return;
    const role = (member?.role as UserRole) || 'viewer';
    if (!hasPermission(role, permission)) {
      setLocation(fallback ?? `/org/${parsedOrgId}/surveys`);
    }
  }, [member, isLoading, parsedOrgId, permission, fallback, setLocation]);

  if (isLoading) return <LoadingScreen />;
  if (!member) return <LoadingScreen />;
  const role = (member.role as UserRole) || 'viewer';
  if (!hasPermission(role, permission)) return <LoadingScreen />;
  return <>{children}</>;
}

// Pages
import Landing from "@/pages/landing";
import AuthPage from "@/pages/auth";
import NotFound from "@/pages/not-found";
import Onboarding from "@/pages/onboarding";
import NoOrganizationPage from "@/pages/no-organization";
import DashboardOverview from "@/pages/dashboard/overview";
import SurveysPage from "@/pages/dashboard/surveys";
import SupervisorDashboard from "@/pages/dashboard/supervisor";
import SurveyEditorPage from "@/pages/dashboard/survey-editor";
import SurveyAnalytics from "@/pages/dashboard/survey-analytics";
import SurveyResults from "@/pages/dashboard/survey-results";
import TeamPage from "@/pages/dashboard/team";
import SettingsPage from "@/pages/dashboard/settings";
import AuditPage from "@/pages/dashboard/audit";
import ViewerPortal from "@/pages/dashboard/viewer-portal";
import AccessControlPage from "@/pages/dashboard/access-control";
import InterviewSession from "@/pages/collection/interview-session";
import PendingInterviews from "@/pages/collection/pending-interviews";
import MyPerformance from "@/pages/collection/my-performance";
import VerifyEmailPage from "@/pages/verify-email";
import ResetPasswordPage from "@/pages/reset-password";
import ContactPage from "@/pages/contact";
import PlatformAdminPage from "@/pages/platform-admin";
import LandingEditorPage from "@/pages/platform/landing-editor";
import GeofencingPage from "@/pages/dashboard/geofencing";
import MessagesPage from "@/pages/dashboard/messages";
import StateMapPage from "@/pages/dashboard/state-map";
import PublicReportPage from "@/pages/public-report";
import { OfflineIndicator } from "@/components/pwa/offline-indicator";
import { PWAProvider } from "@/contexts/pwa-context";
import { setupAutoSync } from "@/lib/syncQueue";
import { prepareAllSurveysOffline } from "@/hooks/use-offline-cache";

/** Silently warms the SW offline cache for all surveys in all orgs
 *  3 seconds after the user authenticates and is online.
 *  This ensures data is available offline even without manual prep. */
function AutoOfflineCache({ orgIds }: { orgIds: number[] }) {
  useEffect(() => {
    if (!navigator.onLine || orgIds.length === 0) return;
    const timer = setTimeout(async () => {
      for (const orgId of orgIds) {
        await prepareAllSurveysOffline(orgId);
      }
    }, 3000); // delay so it doesn't compete with initial page load
    return () => clearTimeout(timer);
  }, [orgIds.join(',')]);
  return null;
}

function AuthenticatedRoutes() {
  const { user, isLoading } = useAuth();
  const { data: orgs, isLoading: orgsLoading } = useOrganizations();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && user && !orgsLoading) {
      if (orgs && orgs.length > 0 && (location === "/" || location === "/dashboard" || location === "/no-organization")) {
        setLocation(`/org/${orgs[0].id}/dashboard`);
      }
    }
  }, [user, isLoading, orgs, orgsLoading, location, setLocation]);

  if (isLoading || (user && orgsLoading)) return <LoadingScreen />;

  if (orgs && orgs.length === 0) {
    return <NoOrganizationPage />;
  }

  const orgIds = orgs?.map(o => o.id) ?? [];

  return (
    <>
      <AutoOfflineCache orgIds={orgIds} />
    <Switch>
      {/* Root redirect - shows loading while useEffect redirects */}
      <Route path="/">{() => <LoadingScreen />}</Route>
      <Route path="/dashboard">{() => <LoadingScreen />}</Route>
      
      {/* Auth page accessible even when logged in (for switching accounts) */}
      <Route path="/auth" component={AuthPage} />
      <Route path="/reset-password" component={ResetPasswordPage} />
      <Route path="/verify-email" component={VerifyEmailPage} />
      
      <Route path="/no-organization" component={NoOrganizationPage} />

      {/* Pages accessible to all org members */}
      <Route path="/org/:orgId/surveys" component={SurveysPage} />
      <Route path="/org/:orgId/messages" component={MessagesPage} />

      {/* Pages requiring analytics:view (coordinators and above) */}
      <Route path="/org/:orgId/dashboard">
        {(p) => <RequirePermission orgId={p.orgId} permission="analytics:view"><DashboardOverview params={p} /></RequirePermission>}
      </Route>
      <Route path="/org/:orgId/supervisor">
        {(p) => <RequirePermission orgId={p.orgId} permission="analytics:view"><SupervisorDashboard params={p} /></RequirePermission>}
      </Route>
      <Route path="/org/:orgId/surveys/:id/analytics">
        {(p) => <RequirePermission orgId={p.orgId} permission="analytics:view"><SurveyAnalytics params={p} /></RequirePermission>}
      </Route>
      <Route path="/org/:orgId/surveys/:surveyId/results">
        {(p) => <RequirePermission orgId={p.orgId} permission="analytics:view_aggregate"><SurveyResults params={p} /></RequirePermission>}
      </Route>
      <Route path="/org/:orgId/state-map">
        {(p) => <RequirePermission orgId={p.orgId} permission="analytics:view"><StateMapPage params={p} /></RequirePermission>}
      </Route>
      <Route path="/org/:orgId/portal">
        {(p) => <RequirePermission orgId={p.orgId} permission="analytics:view_aggregate"><ViewerPortal params={p} /></RequirePermission>}
      </Route>

      {/* Pages requiring surveys:create (coordinators and above) */}
      <Route path="/org/:orgId/surveys/new">
        {(p) => <RequirePermission orgId={p.orgId} permission="surveys:create"><SurveyEditorPage params={p} /></RequirePermission>}
      </Route>
      <Route path="/org/:orgId/surveys/:id">
        {(p) => <RequirePermission orgId={p.orgId} permission="surveys:edit"><SurveyEditorPage params={p} /></RequirePermission>}
      </Route>
      <Route path="/org/:orgId/geofencing">
        {(p) => <RequirePermission orgId={p.orgId} permission="surveys:edit"><GeofencingPage params={p} /></RequirePermission>}
      </Route>

      {/* Pages requiring audit_logs:view (admins and above) */}
      <Route path="/org/:orgId/audit">
        {(p) => <RequirePermission orgId={p.orgId} permission="audit_logs:view"><AuditPage params={p} /></RequirePermission>}
      </Route>

      {/* Pages requiring settings:view (admins and above) */}
      <Route path="/org/:orgId/settings">
        {(p) => <RequirePermission orgId={p.orgId} permission="settings:view"><SettingsPage params={p} /></RequirePermission>}
      </Route>
      <Route path="/org/:orgId/team">
        {(p) => <RequirePermission orgId={p.orgId} permission="members:view"><TeamPage params={p} /></RequirePermission>}
      </Route>
      <Route path="/org/:orgId/access">
        {(p) => <RequirePermission orgId={p.orgId} permission="members:edit_role"><AccessControlPage params={p} /></RequirePermission>}
      </Route>
      
      {/* Platform Admin (Super Admin) */}
      <Route path="/platform" component={PlatformAdminPage} />
      <Route path="/platform/landing" component={LandingEditorPage} />
      
      {/* PWA / Mobile Collection Routes */}
      <Route path="/collect/pending" component={PendingInterviews} />
      <Route path="/collect/my-performance" component={MyPerformance} />
      <Route path="/collect/:surveyId" component={InterviewSession} />
      
      {/* Public shared report (no auth required) */}
      <Route path="/r/:token" component={PublicReportPage} />
      
      {/* Fallback */}
      <Route path="/:rest*" component={NotFound} />
    </Switch>
    </>
  );
}

function Router() {
  const { user, isLoading } = useAuth();

  // For anonymous users, show public routes without loading screen
  if (!isLoading && !user) {
    return (
      <Switch>
        <Route path="/" component={Landing} />
        <Route path="/auth" component={AuthPage} />
        <Route path="/contact" component={ContactPage} />
        <Route path="/verify-email" component={VerifyEmailPage} />
        <Route path="/reset-password" component={ResetPasswordPage} />
        <Route path="/r/:token" component={PublicReportPage} />
        <Route component={AuthPage} /> 
      </Switch>
    );
  }

  if (isLoading) return <LoadingScreen />;

  return <AuthenticatedRoutes />;
}

function App() {
  useEffect(() => {
    setupAutoSync();
  }, []);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <PWAProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
            <OfflineIndicator />
          </TooltipProvider>
        </PWAProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
