import { useOrganization, useOrganizationStats, useCurrentMember } from "@/hooks/use-organizations";
import { useSurveys } from "@/hooks/use-surveys";
import { useOrgResponses } from "@/hooks/use-audit";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { Plus, Users, FileText, Activity, AlertTriangle, ShieldAlert, ArrowRight, MapPinOff } from "lucide-react";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { getSurveyStatusLabel } from "@shared/i18n/labels";
import { useMemo, useEffect, useRef, useState } from "react";
import { hasPermission, type UserRole } from "@shared/rbac";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface GeofenceViolation {
  id: number;
  surveyId: number;
  organizationId: number;
  interviewerId: string;
  latitude: number | null;
  longitude: number | null;
  neighborhood: string;
  createdAt: string;
  interviewerName: string;
  surveyTitle: string;
}

export default function DashboardOverview({ params }: { params: { orgId: string } }) {
  const orgId = parseInt(params.orgId);
  const { data: org, isLoading: orgLoading } = useOrganization(orgId);
  const { data: surveys, isLoading: surveysLoading } = useSurveys(orgId);
  const { data: stats, isLoading: statsLoading } = useOrganizationStats(orgId);
  const { data: responses, isLoading: responsesLoading } = useOrgResponses(orgId);
  const { data: currentMember } = useCurrentMember(orgId);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const userRole = (currentMember?.role as UserRole) || 'viewer';
  const canCreateSurvey = hasPermission(userRole, 'surveys:create');
  const canAudit = hasPermission(userRole, 'responses:audit');
  const canManageSurvey = hasPermission(userRole, 'surveys:edit');
  const canViewAnalytics = hasPermission(userRole, 'analytics:view');

  const suspiciousResponses = useMemo(() => {
    if (!responses) return [];
    return responses.filter(r => r.status === 'suspicious').slice(0, 5);
  }, [responses]);

  const suspiciousCount = useMemo(() => {
    if (!responses) return 0;
    return responses.filter(r => r.status === 'suspicious').length;
  }, [responses]);

  // Geofence violations polling
  const { data: violations = [] } = useQuery<GeofenceViolation[]>({
    queryKey: ['/api/organizations', orgId, 'geofence-violations'],
    queryFn: async () => {
      const res = await fetch(`/api/organizations/${orgId}/geofence-violations`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: canViewAnalytics && !!orgId,
    refetchInterval: 30000,
    staleTime: 20000,
  });

  // Track "page load" timestamp to detect new violations that arrive after load
  const pageLoadedAt = useRef(new Date().toISOString());
  const notifiedViolationIds = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!canViewAnalytics || violations.length === 0) return;
    const newOnes = violations.filter(
      v => v.createdAt > pageLoadedAt.current && !notifiedViolationIds.current.has(v.id)
    );
    newOnes.forEach(v => {
      notifiedViolationIds.current.add(v.id);
      toast({
        title: "Saída de setor detectada",
        description: `${v.interviewerName} saiu do bairro ${v.neighborhood} (${v.surveyTitle})`,
        variant: "destructive",
      });
    });
  }, [violations, canViewAnalytics, toast]);

  const recentViolations = violations.slice(0, 5);

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
          {canCreateSurvey && (
            <Button onClick={() => setLocation(`/org/${orgId}/surveys/new`)} className="gap-2">
              <Plus className="w-4 h-4" /> Nova Pesquisa
            </Button>
          )}
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

        {canAudit && !responsesLoading && suspiciousCount > 0 && (
          <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                <ShieldAlert className="w-5 h-5" />
                Atenção: Entrevistas Suspeitas
              </CardTitle>
              <CardDescription>
                {suspiciousCount} entrevista{suspiciousCount > 1 ? 's' : ''} requer{suspiciousCount > 1 ? 'em' : ''} revisão
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {suspiciousResponses.map((resp) => (
                  <div 
                    key={resp.id} 
                    className="flex items-center justify-between p-3 bg-white dark:bg-background rounded-lg border"
                  >
                    <div className="flex items-center gap-3">
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                      <div>
                        <p className="font-medium text-sm">{resp.survey.title}</p>
                        <p className="text-xs text-muted-foreground">{resp.flagReason || 'Entrevista suspeita'}</p>
                      </div>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setLocation(`/org/${orgId}/audit`)}
                      data-testid={`button-review-${resp.id}`}
                    >
                      Revisar
                    </Button>
                  </div>
                ))}
              </div>
              {suspiciousCount > 5 && (
                <Button 
                  variant="ghost" 
                  className="mt-4 gap-1"
                  onClick={() => setLocation(`/org/${orgId}/audit`)}
                >
                  Ver todas as {suspiciousCount} entrevistas <ArrowRight className="w-4 h-4" />
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {canViewAnalytics && recentViolations.length > 0 && (
          <Card className="border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
                <MapPinOff className="w-5 h-5" />
                Saídas de Setor Detectadas
              </CardTitle>
              <CardDescription>
                {violations.length} ocorrência{violations.length > 1 ? 's' : ''} de entrevistadores fora do bairro designado
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {recentViolations.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between p-3 bg-white dark:bg-background rounded-lg border"
                    data-testid={`row-geofence-violation-${v.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <MapPinOff className="w-4 h-4 text-red-500 shrink-0" />
                      <div>
                        <p className="font-medium text-sm">{v.interviewerName}</p>
                        <p className="text-xs text-muted-foreground">
                          Bairro: <strong>{v.neighborhood}</strong> · {v.surveyTitle} · {new Date(v.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {violations.length > 5 && (
                <p className="text-xs text-muted-foreground mt-3 text-center">
                  Exibindo 5 de {violations.length} ocorrências
                </p>
              )}
            </CardContent>
          </Card>
        )}

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
                  {canManageSurvey && (
                    <Button variant="outline" size="sm" onClick={() => setLocation(`/org/${orgId}/surveys/${survey.id}`)}>
                      Gerenciar
                    </Button>
                  )}
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
