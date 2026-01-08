import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { BarChart3, MapPin, Calendar, Users, Eye, FileText, RefreshCw, CheckCircle2, Clock, Target } from "lucide-react";
import type { Survey } from "@shared/schema";
import { useState, useEffect } from "react";

interface SurveyWithProgress extends Survey {
  totalResponses: number;
  validResponses: number;
  progress: number;
}

const statusLabels: Record<string, string> = {
  draft: "Rascunho",
  active: "Ativa",
  paused: "Pausada",
  completed: "Concluída",
  archived: "Arquivada"
};

const statusColors: Record<string, string> = {
  draft: "secondary",
  active: "default",
  paused: "outline",
  completed: "default",
  archived: "secondary"
};

function SurveyCard({ survey, orgId }: { survey: SurveyWithProgress; orgId: number }) {
  const isActive = survey.status === 'active';
  const isCompleted = survey.status === 'completed';
  
  return (
    <Card className="hover-elevate transition-all">
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
        <div className="flex-1 min-w-0">
          <CardTitle className="text-lg truncate" data-testid={`text-survey-title-${survey.id}`}>
            {survey.title}
          </CardTitle>
          <CardDescription className="flex items-center gap-2 mt-1">
            {survey.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {survey.location}
              </span>
            )}
          </CardDescription>
        </div>
        <Badge 
          variant={statusColors[survey.status] as any} 
          data-testid={`badge-status-${survey.id}`}
          className={isActive ? "bg-green-500 text-white" : isCompleted ? "bg-blue-500 text-white" : ""}
        >
          {isActive && <span className="relative flex h-2 w-2 mr-1"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span></span>}
          {statusLabels[survey.status]}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground flex items-center gap-1">
              <Target className="h-3 w-3" />
              Progresso da Coleta
            </span>
            <span className="font-medium">
              {survey.validResponses} / {survey.targetSample || "—"} entrevistas
            </span>
          </div>
          {survey.targetSample && (
            <Progress 
              value={survey.progress} 
              className="h-2"
              data-testid={`progress-bar-${survey.id}`}
            />
          )}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{survey.progress}% completo</span>
            {survey.targetSample && survey.progress < 100 && (
              <span>Faltam {survey.targetSample - survey.validResponses} entrevistas</span>
            )}
            {survey.progress >= 100 && (
              <span className="text-green-600 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Meta atingida
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm border-t pt-4">
          <div className="flex flex-col">
            <span className="text-muted-foreground">Tipo</span>
            <span className="font-medium capitalize">{survey.type === 'electoral' ? 'Eleitoral' : survey.type}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-muted-foreground">Válidas</span>
            <span className="font-medium text-green-600">{survey.validResponses}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-muted-foreground">Margem</span>
            <span className="font-medium">{survey.marginOfError ? `±${survey.marginOfError}%` : "—"}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-muted-foreground">Início</span>
            <span className="font-medium">
              {survey.startDate ? new Date(survey.startDate).toLocaleDateString('pt-BR') : "—"}
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-2 flex-wrap pt-2">
          <Link href={`/org/${orgId}/surveys/${survey.id}/results`}>
            <Button variant="default" size="sm" data-testid={`button-view-results-${survey.id}`}>
              <BarChart3 className="h-4 w-4 mr-1" />
              Ver Resultados
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ViewerPortal({ params }: { params: { orgId: string } }) {
  const orgId = parseInt(params.orgId);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const { data: surveys, isLoading, refetch, isFetching } = useQuery<SurveyWithProgress[]>({
    queryKey: ['/api/organizations', orgId, 'viewable-surveys'],
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    if (!isFetching && surveys) {
      setLastUpdate(new Date());
    }
  }, [isFetching, surveys]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  const activeSurveys = surveys?.filter(s => s.status === 'active') || [];
  const completedSurveys = surveys?.filter(s => s.status === 'completed') || [];
  const totalInterviews = surveys?.reduce((sum, s) => sum + s.validResponses, 0) || 0;

  return (
    <DashboardLayout orgId={params.orgId}>
      <div className="p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-bold" data-testid="text-page-title">
              Portal de Acompanhamento
            </h1>
            <p className="text-muted-foreground">
              Acompanhe o progresso das suas pesquisas em tempo real.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <Clock className="h-4 w-4" />
              Atualizado: {lastUpdate.toLocaleTimeString('pt-BR')}
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleManualRefresh}
              disabled={isRefreshing || isFetching}
              data-testid="button-refresh"
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${(isRefreshing || isFetching) ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
          </div>
        </div>

        <div className="bg-muted/30 rounded-lg p-3 text-sm text-muted-foreground flex items-center gap-2">
          <RefreshCw className="h-4 w-4" />
          Os dados são atualizados automaticamente a cada 30 segundos.
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium">Pesquisas Ativas</CardTitle>
              <div className="relative">
                <BarChart3 className="h-4 w-4 text-green-500" />
                {activeSurveys.length > 0 && (
                  <span className="absolute -top-1 -right-1 h-2 w-2 bg-green-500 rounded-full animate-pulse" />
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600" data-testid="text-active-count">
                {isLoading ? "..." : activeSurveys.length}
              </div>
              <p className="text-xs text-muted-foreground">coletando dados agora</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium">Concluídas</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600" data-testid="text-completed-count">
                {isLoading ? "..." : completedSurveys.length}
              </div>
              <p className="text-xs text-muted-foreground">prontas para análise</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium">Total de Entrevistas</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-interviews">
                {isLoading ? "..." : totalInterviews}
              </div>
              <p className="text-xs text-muted-foreground">entrevistas válidas</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium">Disponíveis</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-surveys-count">
                {isLoading ? "..." : surveys?.length || 0}
              </div>
              <p className="text-xs text-muted-foreground">pesquisas no portal</p>
            </CardContent>
          </Card>
        </div>

        {activeSurveys.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
              </span>
              Pesquisas em Andamento
            </h2>
            
            <div className="grid gap-4 md:grid-cols-2">
              {activeSurveys.map(survey => (
                <SurveyCard key={survey.id} survey={survey} orgId={orgId} />
              ))}
            </div>
          </div>
        )}

        {completedSurveys.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-blue-500" />
              Pesquisas Concluídas
            </h2>
            
            <div className="grid gap-4 md:grid-cols-2">
              {completedSurveys.map(survey => (
                <SurveyCard key={survey.id} survey={survey} orgId={orgId} />
              ))}
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2, 3].map(i => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-48" />
                  <Skeleton className="h-4 w-32" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-16 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : surveys && surveys.length === 0 ? (
          <Card className="py-12 text-center">
            <CardContent>
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Nenhuma pesquisa disponível</h3>
              <p className="text-muted-foreground">
                Você ainda não tem acesso a nenhuma pesquisa. Entre em contato com o administrador.
              </p>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
