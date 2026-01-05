import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { useOrganizations } from "@/hooks/use-organizations";
import { useEffect, Component, type ReactNode } from "react";
import { LoadingScreen } from "@/components/ui/loading-screen";

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

// Pages
import Landing from "@/pages/landing";
import AuthPage from "@/pages/auth";
import NotFound from "@/pages/not-found";
import Onboarding from "@/pages/onboarding";
import NoOrganizationPage from "@/pages/no-organization";
import DashboardOverview from "@/pages/dashboard/overview";
import SurveysPage from "@/pages/dashboard/surveys";
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
import VerifyEmailPage from "@/pages/verify-email";
import ResetPasswordPage from "@/pages/reset-password";
import ContactPage from "@/pages/contact";
import { OfflineIndicator } from "@/components/pwa/offline-indicator";
import { setupAutoSync } from "@/lib/syncQueue";

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

  return (
    <Switch>
      {/* Root redirect - shows loading while useEffect redirects */}
      <Route path="/">{() => <LoadingScreen />}</Route>
      <Route path="/dashboard">{() => <LoadingScreen />}</Route>
      
      {/* Auth page accessible even when logged in (for switching accounts) */}
      <Route path="/auth" component={AuthPage} />
      <Route path="/reset-password" component={ResetPasswordPage} />
      <Route path="/verify-email" component={VerifyEmailPage} />
      
      <Route path="/no-organization" component={NoOrganizationPage} />
      <Route path="/org/:orgId/dashboard" component={DashboardOverview} />
      <Route path="/org/:orgId/surveys" component={SurveysPage} />
      <Route path="/org/:orgId/surveys/new" component={SurveyEditorPage} />
      <Route path="/org/:orgId/surveys/:id" component={SurveyEditorPage} />
      <Route path="/org/:orgId/surveys/:id/analytics" component={SurveyAnalytics} />
      <Route path="/org/:orgId/surveys/:surveyId/results" component={SurveyResults} />
      <Route path="/org/:orgId/team" component={TeamPage} />
      <Route path="/org/:orgId/audit" component={AuditPage} />
      <Route path="/org/:orgId/settings" component={SettingsPage} />
      <Route path="/org/:orgId/portal" component={ViewerPortal} />
      <Route path="/org/:orgId/access" component={AccessControlPage} />
      
      {/* PWA / Mobile Collection Routes */}
      <Route path="/collect/pending" component={PendingInterviews} />
      <Route path="/collect/:surveyId" component={InterviewSession} />
      
      {/* Fallback */}
      <Route path="/:rest*" component={NotFound} />
    </Switch>
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
        <TooltipProvider>
          <Toaster />
          <Router />
          <OfflineIndicator />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
