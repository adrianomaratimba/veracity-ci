import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useOrganizations } from "@/hooks/use-organizations";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ClipboardList, Users, Clock, MapPin, Flame, Loader2 } from "lucide-react";
import { Link } from "wouter";

interface SurveyOption {
  surveyId: number;
  title: string;
  startDate: string | null;
  endDate: string | null;
  status: string;
  interviewCount: number;
}

interface PerformanceMetrics {
  name: string;
  surveysCompleted: number;
  totalInterviews: number;
  totalTimeMinutes: number;
  totalDistanceMeters: number;
  caloriesBurned: number;
  currentSurvey: SurveyOption | null;
  participatedSurveys: SurveyOption[];
}

function formatTime(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
}

function formatDistance(meters: number): { value: string; unit: string } {
  if (meters < 1000) {
    return { value: meters.toFixed(0), unit: "metros" };
  }
  return { value: (meters / 1000).toFixed(2), unit: "km" };
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export default function MyPerformance() {
  const { user } = useAuth();
  const { data: orgs } = useOrganizations();
  const orgId = orgs?.[0]?.id;
  
  const [selectedSurvey, setSelectedSurvey] = useState<string>("all");

  const surveyIdParam = selectedSurvey !== "all" && selectedSurvey !== "current" ? selectedSurvey : undefined;
  const queryUrl = surveyIdParam 
    ? `/api/analytics/my-performance?orgId=${orgId}&surveyId=${surveyIdParam}`
    : `/api/analytics/my-performance?orgId=${orgId}`;

  const { data: metrics, isLoading } = useQuery<PerformanceMetrics>({
    queryKey: ["/api/analytics/my-performance", orgId, surveyIdParam],
    queryFn: async () => {
      const res = await fetch(queryUrl, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch metrics");
      return res.json();
    },
    enabled: !!orgId,
  });

  const surveyOptions = metrics?.participatedSurveys || [];
  const currentSurvey = metrics?.currentSurvey;

  const selectedSurveyData = selectedSurvey !== "all" && selectedSurvey !== "current"
    ? surveyOptions.find(s => s.surveyId === parseInt(selectedSurvey))
    : selectedSurvey === "current" ? currentSurvey : null;

  const distance = formatDistance(metrics?.totalDistanceMeters || 0);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <Link href="/collect/pending">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-semibold" data-testid="text-interviewer-name">
              {metrics?.name || user?.firstName || "Meu Desempenho"}
            </h1>
            <p className="text-sm text-muted-foreground">Meu desempenho</p>
          </div>
        </div>
      </header>

      <main className="p-4 space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">Filtrar por pesquisa</label>
          <Select value={selectedSurvey} onValueChange={setSelectedSurvey}>
            <SelectTrigger className="w-full" data-testid="select-survey-filter">
              <SelectValue placeholder="Selecione uma pesquisa" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as pesquisas</SelectItem>
              {currentSurvey && (
                <SelectItem value="current">
                  Pesquisa atual - {currentSurvey.title}
                </SelectItem>
              )}
              {surveyOptions.filter(s => s.status !== "active").map(survey => (
                <SelectItem key={survey.surveyId} value={survey.surveyId.toString()}>
                  {survey.title} ({formatDate(survey.startDate)} - {formatDate(survey.endDate)})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedSurveyData && (
          <div className="text-sm text-muted-foreground text-center py-2">
            Dados de: {formatDate(selectedSurveyData.startDate)} a {formatDate(selectedSurveyData.endDate)}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4">
          <Card data-testid="card-surveys-completed">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-blue-100 dark:bg-blue-900/30">
                  <ClipboardList className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">Pesquisas Finalizadas</p>
                  <p className="text-3xl font-bold" data-testid="value-surveys-completed">
                    {metrics?.surveysCompleted || 0}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-interviews">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-green-100 dark:bg-green-900/30">
                  <Users className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">Pessoas Entrevistadas</p>
                  <p className="text-3xl font-bold" data-testid="value-interviews">
                    {metrics?.totalInterviews || 0}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-time">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-purple-100 dark:bg-purple-900/30">
                  <Clock className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">Tempo em Entrevistas</p>
                  <p className="text-3xl font-bold" data-testid="value-time">
                    {formatTime(metrics?.totalTimeMinutes || 0)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-distance">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-orange-100 dark:bg-orange-900/30">
                  <MapPin className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">Distancia Percorrida</p>
                  <p className="text-3xl font-bold" data-testid="value-distance">
                    {distance.value} <span className="text-lg font-normal text-muted-foreground">{distance.unit}</span>
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-calories">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-red-100 dark:bg-red-900/30">
                  <Flame className="h-6 w-6 text-red-600 dark:text-red-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">Calorias Gastas</p>
                  <p className="text-3xl font-bold" data-testid="value-calories">
                    {metrics?.caloriesBurned || 0} <span className="text-lg font-normal text-muted-foreground">kcal</span>
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
