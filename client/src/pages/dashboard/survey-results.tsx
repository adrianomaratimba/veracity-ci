import { useQuery } from "@tanstack/react-query";
import { useCurrentMember } from "@/hooks/use-organizations";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import { 
  TrendingUp, 
  Users,
  MapPin,
  Calendar,
  CheckCircle,
  Download,
  FileText,
  BarChart3,
  PieChartIcon,
  ArrowLeft
} from "lucide-react";
import { useMemo } from "react";
import { Link } from "wouter";
import { hasPermission, isInterviewerRole, type UserRole } from "@shared/rbac";

const CHART_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  '#8884d8',
  '#82ca9d',
  '#ffc658',
  '#ff7300',
  '#00C49F'
];

interface AggregatedResults {
  survey: {
    id: number;
    title: string;
    location?: string;
    targetSample?: number;
    marginOfError?: number;
    status: string;
    startDate?: string;
    endDate?: string;
    questions: Array<{ id: number; text: string; type: string; options?: string[] }>;
  };
  totalResponses: number;
  validResponses: number;
  questionResults: Array<{
    questionId: number;
    questionText: string;
    questionType: string;
    results: Array<{ option: string; count: number; percentage: number }>;
  }>;
}

interface TimelineData {
  date: string;
  total: number;
  questionSnapshots: Array<{
    questionId: number;
    results: Array<{ option: string; count: number; percentage: number }>;
  }>;
}

export default function SurveyResults({ params }: { params: { orgId: string, surveyId: string } }) {
  const surveyId = parseInt(params.surveyId);
  const orgId = parseInt(params.orgId);
  
  const { data: currentMember, isLoading: memberLoading } = useCurrentMember(orgId);
  
  const { data: aggregatedData, isLoading: resultsLoading, error } = useQuery<AggregatedResults>({
    queryKey: ['/api/surveys', surveyId, 'results', 'aggregated'],
    enabled: !!surveyId,
  });
  
  const { data: timelineData, isLoading: timelineLoading } = useQuery<TimelineData[]>({
    queryKey: ['/api/surveys', surveyId, 'results', 'timeline'],
    enabled: !!surveyId,
  });

  const userRole = (currentMember?.role as UserRole) || 'viewer';
  
  const canViewResults = useMemo(() => {
    if (!currentMember) return false;
    if (isInterviewerRole(userRole)) return false;
    return hasPermission(userRole, 'analytics:view') || hasPermission(userRole, 'analytics:view_aggregate');
  }, [currentMember, userRole]);

  const formattedTimeline = useMemo(() => {
    if (!timelineData || timelineData.length === 0) return [];
    return timelineData.map(t => ({
      date: new Date(t.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      total: t.total
    }));
  }, [timelineData]);

  if (memberLoading || resultsLoading) {
    return <LoadingScreen message="Carregando resultados..." />;
  }

  if (!canViewResults) {
    return (
      <DashboardLayout orgId={params.orgId}>
        <div className="flex flex-col items-center justify-center py-16">
          <div className="text-6xl mb-4 text-muted-foreground">
            <BarChart3 className="w-16 h-16" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Acesso Restrito</h2>
          <p className="text-muted-foreground text-center max-w-md">
            Você não tem permissão para visualizar os resultados desta pesquisa.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !aggregatedData) {
    return (
      <DashboardLayout orgId={params.orgId}>
        <div className="flex flex-col items-center justify-center py-16">
          <h2 className="text-xl font-semibold mb-2">Erro ao carregar resultados</h2>
          <p className="text-muted-foreground">Não foi possível carregar os dados da pesquisa.</p>
        </div>
      </DashboardLayout>
    );
  }

  const { survey, totalResponses, validResponses, questionResults } = aggregatedData;
  const completionRate = survey.targetSample ? Math.min(100, Math.round((totalResponses / survey.targetSample) * 100)) : 100;

  return (
    <DashboardLayout orgId={params.orgId}>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href={`/org/${orgId}/surveys`}>
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl sm:text-3xl font-display font-bold text-primary" data-testid="text-survey-title">
                Resultados: {survey.title}
              </h1>
              <p className="text-muted-foreground flex items-center gap-2 flex-wrap mt-1">
                {survey.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-4 h-4" />
                    {survey.location}
                  </span>
                )}
                {survey.marginOfError && (
                  <span className="text-sm">
                    Margem de erro: ±{survey.marginOfError}%
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" data-testid="button-download-pdf">
              <Download className="w-4 h-4 mr-2" />
              Exportar PDF
            </Button>
            <Badge variant={survey.status === 'active' ? 'default' : 'secondary'}>
              {survey.status === 'active' ? 'Em andamento' : survey.status === 'completed' ? 'Concluída' : 'Pausada'}
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Total de Entrevistas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                <span className="text-2xl font-bold" data-testid="text-total-interviews">{totalResponses}</span>
                {survey.targetSample && (
                  <span className="text-sm text-muted-foreground">/ {survey.targetSample}</span>
                )}
              </div>
              {survey.targetSample && (
                <div className="w-full bg-muted rounded-full h-1.5 mt-2">
                  <div 
                    className="bg-primary h-1.5 rounded-full transition-all" 
                    style={{ width: `${completionRate}%` }}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Entrevistas Válidas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-500" />
                <span className="text-2xl font-bold text-green-600" data-testid="text-valid-interviews">
                  {validResponses}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {totalResponses > 0 ? Math.round((validResponses / totalResponses) * 100) : 0}% aprovadas
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Progresso
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-blue-500" />
                <span className="text-2xl font-bold text-blue-600" data-testid="text-progress">
                  {completionRate}%
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                da amostra coletada
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Perguntas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-purple-500" />
                <span className="text-2xl font-bold" data-testid="text-questions-count">
                  {questionResults.length}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                com resultados
              </p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="vote-intention" className="w-full">
          <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-grid">
            <TabsTrigger value="vote-intention" data-testid="tab-vote-intention">
              <BarChart3 className="w-4 h-4 mr-2" />
              Intenção de Voto
            </TabsTrigger>
            <TabsTrigger value="distribution" data-testid="tab-distribution">
              <PieChartIcon className="w-4 h-4 mr-2" />
              Distribuição
            </TabsTrigger>
            <TabsTrigger value="timeline" data-testid="tab-timeline">
              <Calendar className="w-4 h-4 mr-2" />
              Evolução
            </TabsTrigger>
          </TabsList>

          <TabsContent value="vote-intention" className="mt-6">
            <div className="space-y-6">
              {questionResults.map((qr, index) => (
                <Card key={qr.questionId}>
                  <CardHeader>
                    <CardTitle className="text-lg">{qr.questionText}</CardTitle>
                    <CardDescription>
                      Base: {validResponses} entrevistas válidas
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="h-[350px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart 
                        data={qr.results.sort((a, b) => b.percentage - a.percentage)} 
                        layout="vertical"
                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                        <YAxis 
                          type="category" 
                          dataKey="option" 
                          width={150}
                          tick={{ fontSize: 12 }}
                        />
                        <Tooltip 
                          formatter={(value: number, name: string) => [`${value}%`, 'Percentual']}
                          labelFormatter={(label) => `${label}`}
                        />
                        <Bar 
                          dataKey="percentage" 
                          fill={CHART_COLORS[index % CHART_COLORS.length]}
                          radius={[0, 4, 4, 0]}
                          label={{ position: 'right', formatter: (v: number) => `${v}%`, fontSize: 12 }}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              ))}
              
              {questionResults.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <BarChart3 className="w-12 h-12 mb-4" />
                  <p>Nenhum resultado disponível ainda.</p>
                  <p className="text-sm">Aguarde as primeiras entrevistas serem realizadas.</p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="distribution" className="mt-6">
            <div className="grid lg:grid-cols-2 gap-6">
              {questionResults.map((qr, index) => (
                <Card key={qr.questionId}>
                  <CardHeader>
                    <CardTitle className="text-lg">{qr.questionText}</CardTitle>
                  </CardHeader>
                  <CardContent className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={qr.results.filter(r => r.count > 0)}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={90}
                          paddingAngle={2}
                          dataKey="count"
                          nameKey="option"
                          label={({ option, percentage }) => `${option}: ${percentage}%`}
                          labelLine={false}
                        >
                          {qr.results.map((entry, i) => (
                            <Cell key={`cell-${i}`} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: number, name: string) => [value, name]} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="timeline" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="w-5 h-5" />
                  Evolução da Coleta
                </CardTitle>
                <CardDescription>
                  Total acumulado de entrevistas por dia
                </CardDescription>
              </CardHeader>
              <CardContent className="h-[350px]">
                {formattedTimeline.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={formattedTimeline}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip formatter={(value: number) => [`${value} entrevistas`, 'Total']} />
                      <Line 
                        type="monotone" 
                        dataKey="total" 
                        stroke="hsl(var(--primary))" 
                        strokeWidth={2}
                        dot={{ fill: 'hsl(var(--primary))' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <p>Dados de evolução ainda não disponíveis.</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {timelineData && timelineData.length > 0 && questionResults && questionResults.length > 0 && questionResults[0]?.results && questionResults[0].results.length > 0 && (
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5" />
                    Evolução por Opção
                  </CardTitle>
                  <CardDescription>
                    {questionResults[0].questionText}
                  </CardDescription>
                </CardHeader>
                <CardContent className="h-[350px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={timelineData.map(t => {
                      const snapshot = t.questionSnapshots.find(qs => qs.questionId === questionResults[0].questionId);
                      const dataPoint: Record<string, any> = {
                        date: new Date(t.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
                      };
                      if (snapshot?.results) {
                        snapshot.results.forEach(r => {
                          dataPoint[r.option] = r.percentage;
                        });
                      }
                      return dataPoint;
                    })}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                      <Tooltip formatter={(value: number) => [`${value}%`, '']} />
                      <Legend />
                      {questionResults[0].results.map((r, i) => (
                        <Line 
                          key={r.option}
                          type="monotone" 
                          dataKey={r.option} 
                          stroke={CHART_COLORS[i % CHART_COLORS.length]}
                          strokeWidth={2}
                          dot={false}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
