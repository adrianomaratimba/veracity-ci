import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { useOrganizations } from "@/hooks/use-organizations";
import { useEffect } from "react";
import { LoadingScreen } from "@/components/ui/loading-screen";

// Pages
import Landing from "@/pages/landing";
import AuthPage from "@/pages/auth";
import NotFound from "@/pages/not-found";
import Onboarding from "@/pages/onboarding";
import DashboardOverview from "@/pages/dashboard/overview";
import SurveysPage from "@/pages/dashboard/surveys";
import SurveyEditorPage from "@/pages/dashboard/survey-editor";
import SurveyAnalytics from "@/pages/dashboard/survey-analytics";
import TeamPage from "@/pages/dashboard/team";
import SettingsPage from "@/pages/dashboard/settings";
import InterviewSession from "@/pages/collection/interview-session";

function AuthenticatedRoutes() {
  const { user, isLoading } = useAuth();
  const { data: orgs, isLoading: orgsLoading } = useOrganizations();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    // If user loaded but not auth, handled by landing.
    // If auth but no orgs, go to onboarding.
    // If auth and orgs and at / or /dashboard, go to first org dashboard.
    if (!isLoading && user && !orgsLoading) {
      if (orgs && orgs.length === 0 && location !== "/onboarding") {
        setLocation("/onboarding");
      } else if (orgs && orgs.length > 0 && (location === "/" || location === "/dashboard")) {
        setLocation(`/org/${orgs[0].id}/dashboard`);
      }
    }
  }, [user, isLoading, orgs, orgsLoading, location, setLocation]);

  if (isLoading || (user && orgsLoading)) return <LoadingScreen />;

  return (
    <Switch>
      {/* Root redirect - shows loading while useEffect redirects */}
      <Route path="/">{() => <LoadingScreen />}</Route>
      <Route path="/dashboard">{() => <LoadingScreen />}</Route>
      
      {/* Auth page accessible even when logged in (for switching accounts) */}
      <Route path="/auth" component={AuthPage} />
      
      <Route path="/onboarding" component={Onboarding} />
      <Route path="/org/:orgId/dashboard" component={DashboardOverview} />
      <Route path="/org/:orgId/surveys" component={SurveysPage} />
      <Route path="/org/:orgId/surveys/new" component={SurveyEditorPage} />
      <Route path="/org/:orgId/surveys/:id" component={SurveyEditorPage} />
      <Route path="/org/:orgId/surveys/:id/analytics" component={SurveyAnalytics} />
      <Route path="/org/:orgId/team" component={TeamPage} />
      <Route path="/org/:orgId/settings" component={SettingsPage} />
      
      {/* PWA / Mobile Collection Routes */}
      <Route path="/collect/:surveyId" component={InterviewSession} />
      
      {/* Fallback */}
      <Route path="/:rest*" component={NotFound} />
    </Switch>
  );
}

function Router() {
  const { user, isLoading } = useAuth();

  if (isLoading) return <LoadingScreen />;

  if (!user) {
    return (
      <Switch>
        <Route path="/" component={Landing} />
        <Route path="/auth" component={AuthPage} />
        <Route component={AuthPage} /> 
      </Switch>
    );
  }

  return <AuthenticatedRoutes />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
