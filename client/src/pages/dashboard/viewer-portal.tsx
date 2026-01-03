import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { BarChart3, MapPin, Calendar, Users, Eye, FileText, ChevronRight } from "lucide-react";
import type { Survey } from "@shared/schema";

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

function SurveyCard({ survey, orgId }: { survey: Survey; orgId: number }) {
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
        <Badge variant={statusColors[survey.status] as any} data-testid={`badge-status-${survey.id}`}>
          {statusLabels[survey.status]}
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4 text-sm">
          <div className="flex flex-col">
            <span className="text-muted-foreground">Tipo</span>
            <span className="font-medium capitalize">{survey.type}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-muted-foreground">Meta</span>
            <span className="font-medium">{survey.targetSample || "—"}</span>
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
        
        <div className="flex items-center gap-2 flex-wrap">
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
  
  const { data: surveys, isLoading } = useQuery<Survey[]>({
    queryKey: ['/api/organizations', orgId, 'viewable-surveys'],
  });

  return (
    <DashboardLayout orgId={params.orgId}>
      <div className="p-6 space-y-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold" data-testid="text-page-title">
            Portal de Pesquisas
          </h1>
          <p className="text-muted-foreground">
            Visualize os resultados das pesquisas disponíveis para você.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium">Pesquisas Disponíveis</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-surveys-count">
                {isLoading ? "..." : surveys?.length || 0}
              </div>
              <p className="text-xs text-muted-foreground">pesquisas com acesso permitido</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium">Em Andamento</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-active-count">
                {isLoading ? "..." : surveys?.filter(s => s.status === 'active').length || 0}
              </div>
              <p className="text-xs text-muted-foreground">pesquisas ativas</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium">Concluídas</CardTitle>
              <Eye className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-completed-count">
                {isLoading ? "..." : surveys?.filter(s => s.status === 'completed').length || 0}
              </div>
              <p className="text-xs text-muted-foreground">prontas para análise final</p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Pesquisas Disponíveis</h2>
          
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
          ) : surveys && surveys.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {surveys.map(survey => (
                <SurveyCard key={survey.id} survey={survey} orgId={orgId} />
              ))}
            </div>
          ) : (
            <Card className="py-12 text-center">
              <CardContent>
                <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">Nenhuma pesquisa disponível</h3>
                <p className="text-muted-foreground">
                  Você ainda não tem acesso a nenhuma pesquisa. Entre em contato com o administrador.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
