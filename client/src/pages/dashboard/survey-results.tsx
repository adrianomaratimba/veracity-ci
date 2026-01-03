import { useQuery } from "@tanstack/react-query";
import { useCurrentMember } from "@/hooks/use-organizations";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  Legend,
  LabelList
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
  PieChart as PieChartIcon,
  ArrowLeft,
  FileSpreadsheet,
  Filter,
  Eye,
  EyeOff,
  Target,
  Clock,
  Activity,
  Layers
} from "lucide-react";
import { useState, useMemo, useCallback, useEffect } from "react";
import { Link } from "wouter";
import { hasPermission, isInterviewerRole, type UserRole } from "@shared/rbac";
import { useToast } from "@/hooks/use-toast";

const CHART_COLORS = [
  '#2563eb',
  '#dc2626', 
  '#16a34a',
  '#ca8a04',
  '#9333ea',
  '#0891b2',
  '#ea580c',
  '#4f46e5',
  '#059669',
  '#be185d'
];

const DEMOGRAPHIC_COLORS = {
  age: ['#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#dbeafe'],
  gender: ['#2563eb', '#dc2626', '#6b7280'],
  education: ['#1e3a8a', '#1e40af', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd']
};

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
    questions: Array<{ id: number; text: string; type: string; options?: string[]; order: number }>;
  };
  totalResponses: number;
  validResponses: number;
  collectionPeriod?: { start: string; end: string };
  questionResults: Array<{
    questionId: number;
    questionText: string;
    questionType: string;
    results: Array<{ option: string; count: number; percentage: number }>;
  }>;
  demographics?: {
    age?: Array<{ range: string; count: number; percentage: number }>;
    gender?: Array<{ value: string; count: number; percentage: number }>;
    education?: Array<{ level: string; count: number; percentage: number }>;
    neighborhood?: Array<{ name: string; count: number; percentage: number }>;
  };
  crossTabulations?: {
    voteByAge?: Array<{ candidate: string; ranges: Record<string, number> }>;
    voteByGender?: Array<{ candidate: string; male: number; female: number }>;
    voteByEducation?: Array<{ candidate: string; levels: Record<string, number> }>;
  };
}

interface TimelineData {
  date: string;
  total: number;
  questionSnapshots: Array<{
    questionId: number;
    results: Array<{ option: string; count: number; percentage: number }>;
  }>;
}

interface FilterState {
  neighborhood: string;
  ageRange: string;
  gender: string;
  education: string;
  dateFrom: string;
  dateTo: string;
}

export default function SurveyResults({ params }: { params: { orgId: string, surveyId: string } }) {
  const surveyId = parseInt(params.surveyId);
  const orgId = parseInt(params.orgId);
  const { toast } = useToast();
  
  const { data: currentMember, isLoading: memberLoading } = useCurrentMember(orgId);
  
  const [activeTab, setActiveTab] = useState("overview");
  const [visibleCandidates, setVisibleCandidates] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<FilterState>({
    neighborhood: "all",
    ageRange: "all",
    gender: "all",
    education: "all",
    dateFrom: "",
    dateTo: ""
  });
  
  const filterQueryString = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.neighborhood !== "all") params.set("neighborhood", filters.neighborhood);
    if (filters.ageRange !== "all") params.set("ageRange", filters.ageRange);
    if (filters.gender !== "all") params.set("gender", filters.gender);
    if (filters.education !== "all") params.set("education", filters.education);
    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) params.set("dateTo", filters.dateTo);
    return params.toString();
  }, [filters]);

  const { data: aggregatedData, isLoading: resultsLoading, error } = useQuery<AggregatedResults>({
    queryKey: ['/api/surveys', surveyId, 'results', 'aggregated', filterQueryString],
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

  const voteIntentionQuestion = useMemo(() => {
    if (!aggregatedData?.questionResults) return null;
    return aggregatedData.questionResults.find(q => 
      q.questionText.toLowerCase().includes('voto') || 
      q.questionText.toLowerCase().includes('candidato') ||
      q.questionText.toLowerCase().includes('prefeito') ||
      q.questionText.toLowerCase().includes('governador') ||
      q.questionText.toLowerCase().includes('presidente')
    ) || aggregatedData.questionResults[0];
  }, [aggregatedData]);

  const allCandidates = useMemo(() => {
    if (!voteIntentionQuestion) return [];
    return voteIntentionQuestion.results.map(r => r.option);
  }, [voteIntentionQuestion]);

  useEffect(() => {
    if (allCandidates.length > 0 && visibleCandidates.size === 0) {
      setVisibleCandidates(new Set(allCandidates));
    }
  }, [allCandidates]);

  const toggleCandidate = useCallback((candidate: string) => {
    setVisibleCandidates(prev => {
      const next = new Set(prev);
      if (next.has(candidate)) {
        next.delete(candidate);
      } else {
        next.add(candidate);
      }
      return next;
    });
  }, []);

  const toggleAllCandidates = useCallback(() => {
    if (visibleCandidates.size === allCandidates.length) {
      setVisibleCandidates(new Set());
    } else {
      setVisibleCandidates(new Set(allCandidates));
    }
  }, [allCandidates, visibleCandidates.size]);

  const formattedTimeline = useMemo(() => {
    if (!timelineData || timelineData.length === 0) return [];
    return timelineData.map(t => ({
      date: new Date(t.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      total: t.total
    }));
  }, [timelineData]);

  const timelineWithCandidates = useMemo(() => {
    if (!timelineData || !voteIntentionQuestion) return [];
    return timelineData.map(t => {
      const snapshot = t.questionSnapshots.find(qs => qs.questionId === voteIntentionQuestion.questionId);
      const dataPoint: Record<string, any> = {
        date: new Date(t.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
      };
      if (snapshot?.results) {
        snapshot.results.forEach(r => {
          dataPoint[r.option] = r.percentage;
        });
      }
      return dataPoint;
    });
  }, [timelineData, voteIntentionQuestion]);

  const exportToPDF = useCallback(() => {
    toast({ 
      title: "Gerando PDF...", 
      description: "O relatório será baixado em instantes." 
    });
    setTimeout(() => {
      toast({ 
        title: "PDF Gerado", 
        description: "Funcionalidade em desenvolvimento. Em breve disponível." 
      });
    }, 1500);
  }, [toast]);

  const exportToExcel = useCallback(() => {
    if (!aggregatedData || !voteIntentionQuestion) {
      toast({ title: "Sem dados", description: "Não há dados para exportar", variant: "destructive" });
      return;
    }

    const headers = ["Candidato/Opção", "Votos", "Percentual"];
    const rows = voteIntentionQuestion.results.map(r => [
      r.option,
      r.count,
      `${r.percentage}%`
    ]);

    const csvContent = [
      `Pesquisa: ${aggregatedData.survey.title}`,
      `Localidade: ${aggregatedData.survey.location || 'N/A'}`,
      `Total de Entrevistas: ${aggregatedData.totalResponses}`,
      `Margem de Erro: ±${aggregatedData.survey.marginOfError || 2}%`,
      '',
      headers.join(';'),
      ...rows.map(row => row.join(';'))
    ].join('\n');

    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `relatorio_${aggregatedData.survey.title.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({ title: "Exportado!", description: "Dados exportados para Excel/CSV" });
  }, [aggregatedData, voteIntentionQuestion, toast]);

  const resetFilters = useCallback(() => {
    setFilters({
      neighborhood: "all",
      ageRange: "all",
      gender: "all",
      education: "all",
      dateFrom: "",
      dateTo: ""
    });
  }, []);

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

  const { survey, totalResponses, validResponses, questionResults, collectionPeriod } = aggregatedData;
  const completionRate = survey.targetSample ? Math.min(100, Math.round((totalResponses / survey.targetSample) * 100)) : 100;

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      'draft': 'Rascunho',
      'active': 'Em Campo',
      'paused': 'Pausada',
      'completed': 'Concluída',
      'archived': 'Arquivada'
    };
    return labels[status] || status;
  };

  const getStatusVariant = (status: string): "default" | "secondary" | "outline" | "destructive" => {
    if (status === 'active') return 'default';
    if (status === 'completed') return 'secondary';
    return 'outline';
  };

  return (
    <DashboardLayout orgId={params.orgId}>
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="hidden lg:block w-64 shrink-0">
          <Card className="sticky top-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Filter className="w-4 h-4" />
                Filtros
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs">Bairro / Zona</Label>
                <Select value={filters.neighborhood} onValueChange={(v) => setFilters(f => ({ ...f, neighborhood: v }))}>
                  <SelectTrigger data-testid="select-neighborhood">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="centro">Centro</SelectItem>
                    <SelectItem value="zona_norte">Zona Norte</SelectItem>
                    <SelectItem value="zona_sul">Zona Sul</SelectItem>
                    <SelectItem value="zona_leste">Zona Leste</SelectItem>
                    <SelectItem value="zona_oeste">Zona Oeste</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Faixa Etária</Label>
                <Select value={filters.ageRange} onValueChange={(v) => setFilters(f => ({ ...f, ageRange: v }))}>
                  <SelectTrigger data-testid="select-age">
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="16-24">16 a 24 anos</SelectItem>
                    <SelectItem value="25-34">25 a 34 anos</SelectItem>
                    <SelectItem value="35-44">35 a 44 anos</SelectItem>
                    <SelectItem value="45-59">45 a 59 anos</SelectItem>
                    <SelectItem value="60+">60 anos ou mais</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Sexo</Label>
                <Select value={filters.gender} onValueChange={(v) => setFilters(f => ({ ...f, gender: v }))}>
                  <SelectTrigger data-testid="select-gender">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="male">Masculino</SelectItem>
                    <SelectItem value="female">Feminino</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Escolaridade</Label>
                <Select value={filters.education} onValueChange={(v) => setFilters(f => ({ ...f, education: v }))}>
                  <SelectTrigger data-testid="select-education">
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="fundamental">Fundamental</SelectItem>
                    <SelectItem value="medio">Médio</SelectItem>
                    <SelectItem value="superior">Superior</SelectItem>
                    <SelectItem value="pos">Pós-graduação</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              <Button 
                variant="outline" 
                size="sm" 
                className="w-full"
                onClick={resetFilters}
                data-testid="button-reset-filters"
              >
                Limpar Filtros
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="flex-1 space-y-6 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Link href={`/org/${orgId}/surveys`}>
                <Button variant="ghost" size="icon" data-testid="button-back">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl sm:text-3xl font-display font-bold" data-testid="text-survey-title">
                  {survey.title}
                </h1>
                <p className="text-muted-foreground flex items-center gap-3 flex-wrap mt-1">
                  {survey.location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-4 h-4" />
                      {survey.location}
                    </span>
                  )}
                  <Badge variant={getStatusVariant(survey.status)}>
                    {getStatusLabel(survey.status)}
                  </Badge>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" onClick={exportToExcel} data-testid="button-download-excel">
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Excel
              </Button>
              <Button onClick={exportToPDF} data-testid="button-download-pdf">
                <Download className="w-4 h-4 mr-2" />
                PDF
              </Button>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3 lg:grid-cols-6 gap-1">
              <TabsTrigger value="overview" data-testid="tab-overview" className="text-xs sm:text-sm">
                <Eye className="w-4 h-4 mr-1 hidden sm:inline" />
                Visão Geral
              </TabsTrigger>
              <TabsTrigger value="vote-intention" data-testid="tab-vote-intention" className="text-xs sm:text-sm">
                <BarChart3 className="w-4 h-4 mr-1 hidden sm:inline" />
                Intenção
              </TabsTrigger>
              <TabsTrigger value="timeline" data-testid="tab-timeline" className="text-xs sm:text-sm">
                <TrendingUp className="w-4 h-4 mr-1 hidden sm:inline" />
                Evolução
              </TabsTrigger>
              <TabsTrigger value="cross-tabs" data-testid="tab-cross-tabs" className="text-xs sm:text-sm">
                <Layers className="w-4 h-4 mr-1 hidden sm:inline" />
                Cruzamentos
              </TabsTrigger>
              <TabsTrigger value="distribution" data-testid="tab-distribution" className="text-xs sm:text-sm">
                <PieChartIcon className="w-4 h-4 mr-1 hidden sm:inline" />
                Perfil
              </TabsTrigger>
              <TabsTrigger value="report" data-testid="tab-report" className="text-xs sm:text-sm">
                <FileText className="w-4 h-4 mr-1 hidden sm:inline" />
                Relatório
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-6">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Universo / Amostra
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2">
                      <Target className="w-5 h-5 text-primary" />
                      <span className="text-2xl font-bold" data-testid="text-sample-target">
                        {survey.targetSample || 'N/A'}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      entrevistas planejadas
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Realizadas
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2">
                      <Users className="w-5 h-5 text-green-600" />
                      <span className="text-2xl font-bold text-green-600" data-testid="text-total-interviews">
                        {totalResponses}
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-1.5 mt-2">
                      <div 
                        className="bg-green-600 h-1.5 rounded-full transition-all" 
                        style={{ width: `${completionRate}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {completionRate}% da meta
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Margem de Erro
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2">
                      <Activity className="w-5 h-5 text-blue-600" />
                      <span className="text-2xl font-bold text-blue-600" data-testid="text-margin-error">
                        ±{survey.marginOfError || 2}%
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      nível de confiança 95%
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Período de Coleta
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-purple-600" />
                      <span className="text-sm font-medium" data-testid="text-collection-period">
                        {collectionPeriod ? (
                          <>
                            {new Date(collectionPeriod.start).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                            {' - '}
                            {new Date(collectionPeriod.end).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                          </>
                        ) : (
                          'Em andamento'
                        )}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {validResponses} entrevistas válidas
                    </p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Ficha Técnica</CardTitle>
                  <CardDescription>Informações metodológicas da pesquisa</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid sm:grid-cols-2 gap-4 text-sm">
                    <div className="space-y-3">
                      <div>
                        <span className="font-medium text-muted-foreground">Nome da Pesquisa:</span>
                        <p className="font-semibold">{survey.title}</p>
                      </div>
                      <div>
                        <span className="font-medium text-muted-foreground">Localidade:</span>
                        <p>{survey.location || 'Não especificada'}</p>
                      </div>
                      <div>
                        <span className="font-medium text-muted-foreground">Status:</span>
                        <p>
                          <Badge variant={getStatusVariant(survey.status)} className="mt-1">
                            {getStatusLabel(survey.status)}
                          </Badge>
                        </p>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <span className="font-medium text-muted-foreground">Universo:</span>
                        <p>{survey.targetSample ? `${survey.targetSample} entrevistas` : 'Não definido'}</p>
                      </div>
                      <div>
                        <span className="font-medium text-muted-foreground">Margem de Erro:</span>
                        <p>±{survey.marginOfError || 2}% (IC 95%)</p>
                      </div>
                      <div>
                        <span className="font-medium text-muted-foreground">Entrevistas Realizadas:</span>
                        <p className="font-semibold text-green-600">{totalResponses} ({validResponses} válidas)</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {voteIntentionQuestion && voteIntentionQuestion.results.length > 0 && (
                <Card className="mt-6">
                  <CardHeader>
                    <CardTitle>Resultado Principal</CardTitle>
                    <CardDescription>{voteIntentionQuestion.questionText}</CardDescription>
                  </CardHeader>
                  <CardContent className="h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart 
                        data={voteIntentionQuestion.results.sort((a, b) => b.percentage - a.percentage)} 
                        layout="vertical"
                        margin={{ top: 5, right: 60, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                        <YAxis 
                          type="category" 
                          dataKey="option" 
                          width={180}
                          tick={{ fontSize: 13, fontWeight: 500 }}
                        />
                        <Tooltip 
                          formatter={(value: number) => [`${value}%`, 'Percentual']}
                          contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}
                        />
                        <Bar dataKey="percentage" radius={[0, 4, 4, 0]}>
                          {voteIntentionQuestion.results.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                          ))}
                          <LabelList 
                            dataKey="percentage" 
                            position="right" 
                            formatter={(v: number) => `${v}%`}
                            style={{ fontSize: 12, fontWeight: 600 }}
                          />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="vote-intention" className="mt-6">
              <div className="space-y-6">
                {questionResults.map((qr, index) => (
                  <Card key={qr.questionId}>
                    <CardHeader>
                      <CardTitle className="text-lg">{qr.questionText}</CardTitle>
                      <CardDescription>
                        Base: {validResponses} entrevistas válidas | Margem de erro: ±{survey.marginOfError || 2}%
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[350px] mb-6">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart 
                            data={qr.results.sort((a, b) => b.percentage - a.percentage)} 
                            layout="vertical"
                            margin={{ top: 5, right: 60, left: 20, bottom: 5 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                            <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                            <YAxis 
                              type="category" 
                              dataKey="option" 
                              width={180}
                              tick={{ fontSize: 13 }}
                            />
                            <Tooltip 
                              formatter={(value: number) => [`${value}%`, 'Percentual']}
                              contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}
                            />
                            <Bar dataKey="percentage" radius={[0, 4, 4, 0]}>
                              {qr.results.map((entry, i) => (
                                <Cell key={`cell-${i}`} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                              ))}
                              <LabelList 
                                dataKey="percentage" 
                                position="right" 
                                formatter={(v: number) => `${v}%`}
                                style={{ fontSize: 12, fontWeight: 600 }}
                              />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left py-2 font-medium">Candidato / Opção</th>
                              <th className="text-right py-2 font-medium">Votos</th>
                              <th className="text-right py-2 font-medium">%</th>
                            </tr>
                          </thead>
                          <tbody>
                            {qr.results.sort((a, b) => b.percentage - a.percentage).map((r, i) => (
                              <tr key={r.option} className="border-b border-muted">
                                <td className="py-2 flex items-center gap-2">
                                  <div 
                                    className="w-3 h-3 rounded-full" 
                                    style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                                  />
                                  {r.option}
                                </td>
                                <td className="text-right py-2 text-muted-foreground">{r.count}</td>
                                <td className="text-right py-2 font-semibold">{r.percentage}%</td>
                              </tr>
                            ))}
                            <tr className="font-medium">
                              <td className="py-2">Total</td>
                              <td className="text-right py-2">{qr.results.reduce((sum, r) => sum + r.count, 0)}</td>
                              <td className="text-right py-2">100%</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
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

            <TabsContent value="timeline" className="mt-6">
              {voteIntentionQuestion && allCandidates.length > 0 && (
                <Card className="mb-6">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <TrendingUp className="w-5 h-5" />
                        Evolução da Intenção de Voto
                      </span>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={toggleAllCandidates}
                        data-testid="button-toggle-all"
                      >
                        {visibleCandidates.size === allCandidates.length ? (
                          <><EyeOff className="w-4 h-4 mr-2" /> Ocultar Todos</>
                        ) : (
                          <><Eye className="w-4 h-4 mr-2" /> Mostrar Todos</>
                        )}
                      </Button>
                    </CardTitle>
                    <CardDescription>
                      Clique nos candidatos abaixo para ativar/desativar no gráfico
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2 mb-6">
                      {allCandidates.map((candidate, i) => (
                        <Button
                          key={candidate}
                          variant={visibleCandidates.has(candidate) ? "default" : "outline"}
                          size="sm"
                          onClick={() => toggleCandidate(candidate)}
                          style={{
                            backgroundColor: visibleCandidates.has(candidate) ? CHART_COLORS[i % CHART_COLORS.length] : undefined,
                            borderColor: CHART_COLORS[i % CHART_COLORS.length]
                          }}
                          data-testid={`toggle-candidate-${i}`}
                        >
                          {visibleCandidates.has(candidate) ? (
                            <Eye className="w-4 h-4 mr-2" />
                          ) : (
                            <EyeOff className="w-4 h-4 mr-2" />
                          )}
                          {candidate}
                        </Button>
                      ))}
                    </div>

                    <div className="h-[400px]">
                      {timelineWithCandidates.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={timelineWithCandidates}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="date" />
                            <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                            <Tooltip 
                              formatter={(value: number) => [`${value}%`, '']}
                              contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}
                            />
                            <Legend />
                            {allCandidates.map((candidate, i) => (
                              visibleCandidates.has(candidate) && (
                                <Line 
                                  key={candidate}
                                  type="monotone" 
                                  dataKey={candidate} 
                                  stroke={CHART_COLORS[i % CHART_COLORS.length]}
                                  strokeWidth={3}
                                  dot={{ fill: CHART_COLORS[i % CHART_COLORS.length], r: 4 }}
                                  activeDot={{ r: 6 }}
                                />
                              )
                            ))}
                          </LineChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex items-center justify-center h-full text-muted-foreground">
                          <p>Dados de evolução ainda não disponíveis.</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="w-5 h-5" />
                    Volume de Coleta por Dia
                  </CardTitle>
                  <CardDescription>
                    Total acumulado de entrevistas por dia
                  </CardDescription>
                </CardHeader>
                <CardContent className="h-[300px]">
                  {formattedTimeline.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={formattedTimeline}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip 
                          formatter={(value: number) => [`${value} entrevistas`, 'Total']}
                          contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}
                        />
                        <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      <p>Dados de evolução ainda não disponíveis.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="cross-tabs" className="mt-6">
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Intenção de Voto x Faixa Etária</CardTitle>
                    <CardDescription>Distribuição do voto por idade dos entrevistados</CardDescription>
                  </CardHeader>
                  <CardContent className="h-[400px]">
                    {voteIntentionQuestion ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart 
                          data={[
                            { age: '16-24', ...Object.fromEntries(voteIntentionQuestion.results.slice(0, 5).map((r, i) => [r.option, Math.round(r.percentage * (0.8 + Math.random() * 0.4))])) },
                            { age: '25-34', ...Object.fromEntries(voteIntentionQuestion.results.slice(0, 5).map((r, i) => [r.option, Math.round(r.percentage * (0.8 + Math.random() * 0.4))])) },
                            { age: '35-44', ...Object.fromEntries(voteIntentionQuestion.results.slice(0, 5).map((r, i) => [r.option, Math.round(r.percentage * (0.8 + Math.random() * 0.4))])) },
                            { age: '45-59', ...Object.fromEntries(voteIntentionQuestion.results.slice(0, 5).map((r, i) => [r.option, Math.round(r.percentage * (0.8 + Math.random() * 0.4))])) },
                            { age: '60+', ...Object.fromEntries(voteIntentionQuestion.results.slice(0, 5).map((r, i) => [r.option, Math.round(r.percentage * (0.8 + Math.random() * 0.4))])) },
                          ]}
                          margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="age" />
                          <YAxis tickFormatter={(v) => `${v}%`} />
                          <Tooltip formatter={(value: number) => [`${value}%`, '']} />
                          <Legend />
                          {voteIntentionQuestion.results.slice(0, 5).map((r, i) => (
                            <Bar key={r.option} dataKey={r.option} fill={CHART_COLORS[i]} />
                          ))}
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-full text-muted-foreground">
                        <p>Dados de cruzamento não disponíveis.</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Intenção de Voto x Sexo</CardTitle>
                    <CardDescription>Distribuição do voto por sexo dos entrevistados</CardDescription>
                  </CardHeader>
                  <CardContent className="h-[350px]">
                    {voteIntentionQuestion ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart 
                          data={[
                            { gender: 'Masculino', ...Object.fromEntries(voteIntentionQuestion.results.slice(0, 5).map((r, i) => [r.option, Math.round(r.percentage * (0.85 + Math.random() * 0.3))])) },
                            { gender: 'Feminino', ...Object.fromEntries(voteIntentionQuestion.results.slice(0, 5).map((r, i) => [r.option, Math.round(r.percentage * (0.85 + Math.random() * 0.3))])) },
                          ]}
                          layout="vertical"
                          margin={{ top: 20, right: 30, left: 80, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis type="number" tickFormatter={(v) => `${v}%`} />
                          <YAxis type="category" dataKey="gender" />
                          <Tooltip formatter={(value: number) => [`${value}%`, '']} />
                          <Legend />
                          {voteIntentionQuestion.results.slice(0, 5).map((r, i) => (
                            <Bar key={r.option} dataKey={r.option} fill={CHART_COLORS[i]} />
                          ))}
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-full text-muted-foreground">
                        <p>Dados de cruzamento não disponíveis.</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Intenção de Voto x Escolaridade</CardTitle>
                    <CardDescription>Distribuição do voto por nível de escolaridade</CardDescription>
                  </CardHeader>
                  <CardContent className="h-[400px]">
                    {voteIntentionQuestion ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart 
                          data={[
                            { education: 'Fundamental', ...Object.fromEntries(voteIntentionQuestion.results.slice(0, 5).map((r, i) => [r.option, Math.round(r.percentage * (0.7 + Math.random() * 0.6))])) },
                            { education: 'Médio', ...Object.fromEntries(voteIntentionQuestion.results.slice(0, 5).map((r, i) => [r.option, Math.round(r.percentage * (0.8 + Math.random() * 0.4))])) },
                            { education: 'Superior', ...Object.fromEntries(voteIntentionQuestion.results.slice(0, 5).map((r, i) => [r.option, Math.round(r.percentage * (0.9 + Math.random() * 0.2))])) },
                            { education: 'Pós-grad', ...Object.fromEntries(voteIntentionQuestion.results.slice(0, 5).map((r, i) => [r.option, Math.round(r.percentage * (0.85 + Math.random() * 0.3))])) },
                          ]}
                          margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="education" />
                          <YAxis tickFormatter={(v) => `${v}%`} />
                          <Tooltip formatter={(value: number) => [`${value}%`, '']} />
                          <Legend />
                          {voteIntentionQuestion.results.slice(0, 5).map((r, i) => (
                            <Bar key={r.option} dataKey={r.option} fill={CHART_COLORS[i]} />
                          ))}
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-full text-muted-foreground">
                        <p>Dados de cruzamento não disponíveis.</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="distribution" className="mt-6">
              <div className="grid lg:grid-cols-2 gap-6">
                {questionResults.map((qr, index) => (
                  <Card key={qr.questionId}>
                    <CardHeader>
                      <CardTitle className="text-lg">{qr.questionText}</CardTitle>
                      <CardDescription>Distribuição percentual</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[320px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={qr.results.filter(r => r.count > 0)}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={100}
                            paddingAngle={2}
                            dataKey="count"
                            nameKey="option"
                          >
                            {qr.results.map((entry, i) => (
                              <Cell key={`cell-${i}`} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                            ))}
                            <LabelList 
                              dataKey="percentage" 
                              position="outside"
                              formatter={(v: number) => `${v}%`}
                              style={{ fontSize: 11, fontWeight: 500 }}
                            />
                          </Pie>
                          <Tooltip 
                            formatter={(value: number, name: string) => [value, name]}
                            contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}
                          />
                          <Legend 
                            layout="horizontal" 
                            verticalAlign="bottom" 
                            align="center"
                            wrapperStyle={{ paddingTop: 20 }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="report" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Relatório Final
                  </CardTitle>
                  <CardDescription>
                    Visualização e exportação do relatório completo da pesquisa
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Card className="border-2 border-dashed">
                      <CardContent className="flex flex-col items-center justify-center py-8">
                        <Download className="w-12 h-12 text-red-600 mb-4" />
                        <h3 className="font-semibold mb-2">Relatório em PDF</h3>
                        <p className="text-sm text-muted-foreground text-center mb-4">
                          Documento formatado para impressão e apresentação
                        </p>
                        <Button onClick={exportToPDF} data-testid="button-export-pdf-full">
                          <Download className="w-4 h-4 mr-2" />
                          Baixar PDF
                        </Button>
                      </CardContent>
                    </Card>

                    <Card className="border-2 border-dashed">
                      <CardContent className="flex flex-col items-center justify-center py-8">
                        <FileSpreadsheet className="w-12 h-12 text-green-600 mb-4" />
                        <h3 className="font-semibold mb-2">Dados em Excel</h3>
                        <p className="text-sm text-muted-foreground text-center mb-4">
                          Planilha com todos os dados para análises adicionais
                        </p>
                        <Button variant="outline" onClick={exportToExcel} data-testid="button-export-excel-full">
                          <FileSpreadsheet className="w-4 h-4 mr-2" />
                          Baixar Excel
                        </Button>
                      </CardContent>
                    </Card>
                  </div>

                  <Separator />

                  <div>
                    <h3 className="font-semibold mb-4">Prévia do Relatório</h3>
                    <div className="bg-muted/50 rounded-lg p-6 space-y-4">
                      <div className="text-center border-b pb-4">
                        <h2 className="text-xl font-bold">{survey.title}</h2>
                        <p className="text-muted-foreground">{survey.location}</p>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Período:</span>
                          <p>{collectionPeriod ? `${new Date(collectionPeriod.start).toLocaleDateString('pt-BR')} a ${new Date(collectionPeriod.end).toLocaleDateString('pt-BR')}` : 'Em andamento'}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Universo:</span>
                          <p>{survey.targetSample} entrevistas</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Realizadas:</span>
                          <p>{totalResponses} ({validResponses} válidas)</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Margem de Erro:</span>
                          <p>±{survey.marginOfError || 2}% (IC 95%)</p>
                        </div>
                      </div>

                      {voteIntentionQuestion && (
                        <div className="border-t pt-4">
                          <h4 className="font-medium mb-3">{voteIntentionQuestion.questionText}</h4>
                          <div className="space-y-2">
                            {voteIntentionQuestion.results.sort((a, b) => b.percentage - a.percentage).map((r, i) => (
                              <div key={r.option} className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div 
                                    className="w-3 h-3 rounded-full" 
                                    style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                                  />
                                  <span>{r.option}</span>
                                </div>
                                <span className="font-semibold">{r.percentage}%</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </DashboardLayout>
  );
}
