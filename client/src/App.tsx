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
import NotFound from "@/pages/not-found";
import Onboarding from "@/pages/onboarding";
import DashboardOverview from "@/pages/dashboard/overview";
import SurveyAnalytics from "@/pages/dashboard/survey-analytics";
import InterviewSession from "@/pages/collection/interview-session";

function AuthenticatedRoutes() {
  const { user, isLoading } = useAuth();
  const { data: orgs, isLoading: orgsLoading } = useOrganizations();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    // If user loaded but not auth, handled by landing.
    // If auth but no orgs, go to onboarding.
    // If auth and orgs and at /dashboard (root dash), go to first org.
    if (!isLoading && user && !orgsLoading) {
      if (orgs && orgs.length === 0 && location !== "/onboarding") {
        setLocation("/onboarding");
      } else if (orgs && orgs.length > 0 && location === "/dashboard") {
        setLocation(`/org/${orgs[0].id}/dashboard`);
      }
    }
  }, [user, isLoading, orgs, orgsLoading, location, setLocation]);

  if (isLoading || (user && orgsLoading)) return <LoadingScreen />;

  return (
    <Switch>
      <Route path="/onboarding" component={Onboarding} />
      <Route path="/org/:orgId/dashboard" component={DashboardOverview} />
      <Route path="/org/:orgId/surveys/:id/analytics" component={SurveyAnalytics} />
      {/* Add more dashboard routes here */}
      
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
        <Route path="/api/login" component={() => { window.location.href = "/api/login"; return null; }} />
        <Route component={() => { window.location.href = "/api/login"; return null; }} /> 
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
