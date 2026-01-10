import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useOrganizations } from "@/hooks/use-organizations";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, ClipboardList, Users, Clock, MapPin, Flame, Loader2, ChevronDown } from "lucide-react";
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
  profileImageUrl?: string | null;
  surveysCompleted: number;
  totalInterviews: number;
  totalTimeMinutes: number;
  totalDistanceMeters: number;
  caloriesBurned: number;
  currentSurvey: SurveyOption | null;
  participatedSurveys: SurveyOption[];
}

function formatTimeHM(minutes: number): { hours: string; mins: string } {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return { hours: h.toString().padStart(2, '0'), mins: m.toString().padStart(2, '0') };
}

function formatDistance(meters: number): { value: string; unit: string } {
  if (meters < 1000) {
    return { value: meters.toFixed(0), unit: "m" };
  }
  return { value: (meters / 1000).toFixed(1), unit: "km" };
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
  const time = formatTimeHM(metrics?.totalTimeMinutes || 0);

  const initials = (metrics?.name || user?.firstName || "").split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  const profileUrl = metrics?.profileImageUrl || user?.profileImageUrl;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-sm border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <Link href={orgId ? `/org/${orgId}/surveys` : "/collect/pending"}>
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-lg font-semibold">Meu Desempenho</h1>
        </div>
      </header>

      <main className="p-4 space-y-6 max-w-lg mx-auto">
        <div className="flex flex-col items-center pt-4 pb-2">
          <Avatar className="w-24 h-24 border-4 border-background shadow-lg">
            <AvatarImage src={profileUrl || undefined} />
            <AvatarFallback className="text-2xl font-semibold bg-primary/10 text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>
          <h2 className="mt-3 text-xl font-bold" data-testid="text-interviewer-name">
            {metrics?.name || user?.firstName || "Entrevistador"}
          </h2>
          <p className="text-sm text-muted-foreground">Entrevistador</p>
        </div>

        <div className="space-y-2">
          <Select value={selectedSurvey} onValueChange={setSelectedSurvey}>
            <SelectTrigger className="w-full bg-card border" data-testid="select-survey-filter">
              <SelectValue placeholder="Filtrar por pesquisa" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as pesquisas</SelectItem>
              {currentSurvey && (
                <SelectItem value="current">
                  Atual: {currentSurvey.title}
                </SelectItem>
              )}
              {surveyOptions.filter(s => s.status !== "active").map(survey => (
                <SelectItem key={survey.surveyId} value={survey.surveyId.toString()}>
                  {survey.title} ({formatDate(survey.startDate)} - {formatDate(survey.endDate)})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedSurveyData && (
            <p className="text-xs text-muted-foreground text-center">
              Periodo: {formatDate(selectedSurveyData.startDate)} a {formatDate(selectedSurveyData.endDate)}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Card className="overflow-visible" data-testid="card-surveys-completed">
            <CardContent className="p-4 text-center">
              <div className="mx-auto w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-2">
                <ClipboardList className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <p className="text-2xl font-bold" data-testid="value-surveys-completed">
                {metrics?.surveysCompleted || 0}
              </p>
              <p className="text-xs text-muted-foreground">Pesquisas</p>
            </CardContent>
          </Card>

          <Card className="overflow-visible" data-testid="card-interviews">
            <CardContent className="p-4 text-center">
              <div className="mx-auto w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-2">
                <Users className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <p className="text-2xl font-bold" data-testid="value-interviews">
                {metrics?.totalInterviews || 0}
              </p>
              <p className="text-xs text-muted-foreground">Entrevistas</p>
            </CardContent>
          </Card>
        </div>

        <Card className="overflow-visible" data-testid="card-time">
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shrink-0">
                <Clock className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-muted-foreground mb-1">Tempo Trabalhado</p>
                <div className="flex items-baseline gap-1" data-testid="value-time">
                  <span className="text-3xl font-bold">{time.hours}</span>
                  <span className="text-lg text-muted-foreground">h</span>
                  <span className="text-3xl font-bold ml-1">{time.mins}</span>
                  <span className="text-lg text-muted-foreground">min</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-visible" data-testid="card-distance">
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center shrink-0">
                <MapPin className="h-6 w-6 text-orange-600 dark:text-orange-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-muted-foreground mb-1">Distancia Percorrida</p>
                <div className="flex items-baseline gap-1" data-testid="value-distance">
                  <span className="text-3xl font-bold">{distance.value}</span>
                  <span className="text-lg text-muted-foreground">{distance.unit}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-visible" data-testid="card-calories">
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                <Flame className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-muted-foreground mb-1">Calorias Gastas</p>
                <div className="flex items-baseline gap-1" data-testid="value-calories">
                  <span className="text-3xl font-bold">{metrics?.caloriesBurned || 0}</span>
                  <span className="text-lg text-muted-foreground">kcal</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="pb-6" />
      </main>
    </div>
  );
}
