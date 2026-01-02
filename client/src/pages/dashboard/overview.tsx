import { useOrganization, useOrganizationStats } from "@/hooks/use-organizations";
import { useSurveys } from "@/hooks/use-surveys";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { Plus, Users, FileText, Activity } from "lucide-react";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { getSurveyStatusLabel } from "@shared/i18n/labels";

export default function DashboardOverview({ params }: { params: { orgId: string } }) {
  const orgId = parseInt(params.orgId);
  const { data: org, isLoading: orgLoading } = useOrganization(orgId);
  const { data: surveys, isLoading: surveysLoading } = useSurveys(orgId);
  const { data: stats, isLoading: statsLoading } = useOrganizationStats(orgId);
  const [, setLocation] = useLocation();

  if (orgLoading || surveysLoading || statsLoading) return <LoadingScreen message="Carregando Painel..." />; 
  if (!org) return <div>Organização não encontrada</div>;

  return (
    <DashboardLayout orgId={params.orgId}>
      <div className="flex flex-col gap-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-primary">{org.name}</h1>
            <p className="text-muted-foreground">Visão geral das suas atividades de pesquisa</p>
          </div>
          <Button onClick={() => setLocation(`/org/${orgId}/surveys/new`)} className="gap-2">
            <Plus className="w-4 h-4" /> Nova Pesquisa
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="shadow-sm border-l-4 border-l-primary hover:shadow-md transition-all">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Pesquisas Ativas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="p-3 bg-primary/10 rounded-full text-primary">
                  <Activity className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-3xl font-bold font-display" data-testid="text-active-surveys">{stats?.activeSurveys ?? 0}</span>
                  <p className="text-xs text-muted-foreground">Coletando dados atualmente</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-l-4 border-l-secondary hover:shadow-md transition-all">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Rascunhos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="p-3 bg-secondary rounded-full text-secondary-foreground">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-3xl font-bold font-display" data-testid="text-draft-surveys">{stats?.draftSurveys ?? 0}</span>
                  <p className="text-xs text-muted-foreground">Prontos para lançar</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-l-4 border-l-accent hover:shadow-md transition-all">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total de Entrevistas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="p-3 bg-accent/10 rounded-full text-accent">
                  <Users className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-3xl font-bold font-display" data-testid="text-total-interviews">{stats?.interviewsThisMonth ?? 0}</span>
                  <p className="text-xs text-muted-foreground">Este mês</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div>
          <h2 className="text-xl font-display font-bold mb-4">Pesquisas Recentes</h2>
          <div className="bg-card rounded-xl border shadow-sm divide-y">
            {surveys && surveys.length > 0 ? (
              surveys.map(survey => (
                <div key={survey.id} className="p-4 flex items-center justify-between hover:bg-muted/30 transition-colors">
                  <div>
                    <h3 className="font-semibold text-primary">{survey.title}</h3>
                    <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${
                        survey.status === 'active' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'
                      }`}>
                        {getSurveyStatusLabel(survey.status)}
                      </span>
                      <span>•</span>
                      <span>Criada em {new Date(survey.createdAt!).toLocaleDateString('pt-BR')}</span>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setLocation(`/org/${orgId}/surveys/${survey.id}`)}>
                    Gerenciar
                  </Button>
                </div>
              ))
            ) : (
              <div className="p-12 text-center text-muted-foreground">
                <p>Nenhuma pesquisa ainda. Crie a primeira para começar.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
