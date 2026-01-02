import { useOrganizations, useOrganization } from "@/hooks/use-organizations";
import { useSurveys } from "@/hooks/use-surveys";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { Plus, Users, FileText, Activity } from "lucide-react";
import { LoadingScreen } from "@/components/ui/loading-screen";

export default function DashboardOverview({ params }: { params: { orgId: string } }) {
  const orgId = parseInt(params.orgId);
  const { data: org, isLoading: orgLoading } = useOrganization(orgId);
  const { data: surveys, isLoading: surveysLoading } = useSurveys(orgId);
  const [, setLocation] = useLocation();

  if (orgLoading || surveysLoading) return <LoadingScreen message="Loading Dashboard..." />;
  if (!org) return <div>Organization not found</div>;

  const activeSurveys = surveys?.filter(s => s.status === 'active') || [];
  const draftSurveys = surveys?.filter(s => s.status === 'draft') || [];

  return (
    <DashboardLayout orgId={params.orgId}>
      <div className="flex flex-col gap-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-primary">{org.name}</h1>
            <p className="text-muted-foreground">Overview of your research activities</p>
          </div>
          <Button onClick={() => setLocation(`/org/${orgId}/surveys/new`)} className="gap-2">
            <Plus className="w-4 h-4" /> New Survey
          </Button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="shadow-sm border-l-4 border-l-primary hover:shadow-md transition-all">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Active Surveys</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="p-3 bg-primary/10 rounded-full text-primary">
                  <Activity className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-3xl font-bold font-display">{activeSurveys.length}</span>
                  <p className="text-xs text-muted-foreground">Currently collecting data</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-l-4 border-l-secondary hover:shadow-md transition-all">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Drafts</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="p-3 bg-secondary rounded-full text-secondary-foreground">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-3xl font-bold font-display">{draftSurveys.length}</span>
                  <p className="text-xs text-muted-foreground">Ready to launch</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-l-4 border-l-accent hover:shadow-md transition-all">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Interviews</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="p-3 bg-accent/10 rounded-full text-accent">
                  <Users className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-3xl font-bold font-display">0</span>
                  <p className="text-xs text-muted-foreground">This month</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Activity / Surveys List */}
        <div>
          <h2 className="text-xl font-display font-bold mb-4">Recent Surveys</h2>
          <div className="bg-card rounded-xl border shadow-sm divide-y">
            {surveys && surveys.length > 0 ? (
              surveys.map(survey => (
                <div key={survey.id} className="p-4 flex items-center justify-between hover:bg-muted/30 transition-colors">
                  <div>
                    <h3 className="font-semibold text-primary">{survey.title}</h3>
                    <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${
                        survey.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {survey.status}
                      </span>
                      <span>•</span>
                      <span>Created {new Date(survey.createdAt!).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setLocation(`/org/${orgId}/surveys/${survey.id}`)}>
                    Manage
                  </Button>
                </div>
              ))
            ) : (
              <div className="p-12 text-center text-muted-foreground">
                <p>No surveys yet. Create your first one to get started.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
