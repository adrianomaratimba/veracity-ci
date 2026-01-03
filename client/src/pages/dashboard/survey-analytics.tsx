import { useSurvey } from "@/hooks/use-surveys";
import { useResponseList } from "@/hooks/use-responses";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { MapView } from "@/components/analytics/map-view";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  Legend,
  AreaChart,
  Area
} from 'recharts';
import { 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  MapPin, 
  Mic, 
  AlertTriangle, 
  CheckCircle, 
  Users,
  Calendar,
  Filter,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Play,
  Download,
  FileSpreadsheet
} from "lucide-react";
import { useState, useMemo, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";

export default function SurveyAnalytics({ params }: { params: { orgId: string, id: string } }) {
  const surveyId = parseInt(params.id);
  const orgId = parseInt(params.orgId);
  const { toast } = useToast();
  
  const { data: survey, isLoading: surveyLoading } = useSurvey(surveyId);
  const { data: responses, isLoading: responsesLoading } = useResponseList(surveyId);
  
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const exportToCSV = useCallback(() => {
    if (!responses || responses.length === 0 || !survey) {
      toast({ title: "Sem dados", description: "Não há respostas para exportar", variant: "destructive" });
      return;
    }

    const headers = [
      "ID",
      "Data/Hora",
      "Entrevistador",
      "Status",
      "Latitude",
      "Longitude",
      "Precisão GPS (m)",
      "Duração (s)",
      "Motivo Suspeita",
      "URL Áudio"
    ];

    const rows = responses.map(r => [
      r.id,
      r.createdAt ? new Date(r.createdAt).toLocaleString('pt-BR') : '',
      r.interviewerId || '',
      r.status === 'valid' ? 'Válida' : r.status === 'suspicious' ? 'Suspeita' : r.status,
      r.latitude || '',
      r.longitude || '',
      r.accuracy || '',
      r.duration || '',
      r.flagReason || '',
      r.audioUrl || ''
    ]);

    const csvContent = [
      headers.join(';'),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
    ].join('\n');

    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${survey.title.replace(/[^a-zA-Z0-9]/g, '_')}_respostas_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({ title: "Exportado!", description: `${responses.length} respostas exportadas para CSV` });
  }, [responses, survey, toast]);

  // Memoized calculations
  const analytics = useMemo(() => {
    if (!responses || responses.length === 0) {
      return {
        totalResponses: 0,
        validResponses: 0,
        suspiciousResponses: 0,
        averageDuration: 0,
        averageAccuracy: 0,
        completionRate: 0,
        dailyData: [],
        hourlyData: [],
        interviewerStats: [],
        statusDistribution: [],
        accuracyDistribution: []
      };
    }

    const total = responses.length;
    const valid = responses.filter(r => r.status === 'valid').length;
    const suspicious = responses.filter(r => r.status === 'suspicious').length;
    
    const avgDuration = Math.round(responses.reduce((acc, r) => acc + (r.duration || 0), 0) / total);
    const avgAccuracy = Math.round(responses.reduce((acc, r) => acc + (r.accuracy || 0), 0) / total * 10) / 10;
    
    const completionRate = survey?.targetSample && survey.targetSample > 0
      ? Math.min(100, Math.round((total / survey.targetSample) * 100))
      : 100;

    // Daily breakdown - sort by date ascending first
    const dailyMap = new Map<string, { isoDate: string, date: string, total: number, valid: number, suspicious: number }>();
    responses.forEach(r => {
      const dateObj = new Date(r.createdAt!);
      const isoDate = dateObj.toISOString().split('T')[0];
      const displayDate = dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      const existing = dailyMap.get(isoDate) || { isoDate, date: displayDate, total: 0, valid: 0, suspicious: 0 };
      existing.total++;
      if (r.status === 'valid') existing.valid++;
      if (r.status === 'suspicious') existing.suspicious++;
      dailyMap.set(isoDate, existing);
    });
    const dailyData = Array.from(dailyMap.values())
      .sort((a, b) => a.isoDate.localeCompare(b.isoDate))
      .slice(-14);

    // Hourly breakdown - use numeric comparison
    const hourlyMap = new Map<number, number>();
    for (let i = 6; i <= 22; i++) hourlyMap.set(i, 0);
    responses.forEach(r => {
      const hour = new Date(r.createdAt!).getHours();
      if (hour >= 6 && hour <= 22) {
        hourlyMap.set(hour, (hourlyMap.get(hour) || 0) + 1);
      }
    });
    const hourlyData = Array.from(hourlyMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([hour, count]) => ({ hour: `${hour}h`, count }));

    // Interviewer stats
    const interviewerMap = new Map<string, { id: string, total: number, valid: number, suspicious: number, avgDuration: number, avgAccuracy: number }>();
    responses.forEach(r => {
      const id = r.interviewerId || 'Desconhecido';
      const existing = interviewerMap.get(id) || { id, total: 0, valid: 0, suspicious: 0, avgDuration: 0, avgAccuracy: 0 };
      existing.total++;
      if (r.status === 'valid') existing.valid++;
      if (r.status === 'suspicious') existing.suspicious++;
      existing.avgDuration += (r.duration || 0);
      existing.avgAccuracy += (r.accuracy || 0);
      interviewerMap.set(id, existing);
    });
    const interviewerStats = Array.from(interviewerMap.values())
      .map(i => ({
        ...i,
        avgDuration: Math.round(i.avgDuration / i.total),
        avgAccuracy: Math.round(i.avgAccuracy / i.total * 10) / 10,
        successRate: Math.round((i.valid / i.total) * 100)
      }))
      .sort((a, b) => b.total - a.total);

    // Status distribution for pie chart
    const statusDistribution = [
      { name: 'Válidas', value: valid, color: '#22c55e' },
      { name: 'Suspeitas', value: suspicious, color: '#f59e0b' },
    ].filter(d => d.value > 0);

    // GPS accuracy distribution
    const accuracyBuckets = { '0-10m': 0, '10-25m': 0, '25-50m': 0, '>50m': 0 };
    responses.forEach(r => {
      const acc = r.accuracy || 0;
      if (acc <= 10) accuracyBuckets['0-10m']++;
      else if (acc <= 25) accuracyBuckets['10-25m']++;
      else if (acc <= 50) accuracyBuckets['25-50m']++;
      else accuracyBuckets['>50m']++;
    });
    const accuracyDistribution = Object.entries(accuracyBuckets).map(([range, count]) => ({ range, count }));

    return {
      totalResponses: total,
      validResponses: valid,
      suspiciousResponses: suspicious,
      averageDuration: avgDuration,
      averageAccuracy: avgAccuracy,
      completionRate,
      dailyData,
      hourlyData,
      interviewerStats,
      statusDistribution,
      accuracyDistribution
    };
  }, [responses, survey]);

  // Filtered responses for table
  const filteredResponses = useMemo(() => {
    if (!responses) return [];
    return responses.filter(r => {
      const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
      const matchesSearch = searchTerm === '' || 
        r.interviewerId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.id.toString().includes(searchTerm);
      return matchesStatus && matchesSearch;
    });
  }, [responses, statusFilter, searchTerm]);

  const paginatedResponses = filteredResponses.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );
  const totalPages = Math.ceil(filteredResponses.length / itemsPerPage);

  const formatDuration = (seconds: number) => {
    if (seconds === 0) return 'N/D';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      'valid': 'Válida',
      'suspicious': 'Suspeita',
      'invalid': 'Inválida'
    };
    return labels[status] || status;
  };

  if (surveyLoading || responsesLoading) return <LoadingScreen message="Processando dados..." />;
  if (!survey || !responses) return <div>Dados não disponíveis</div>;

  return (
    <DashboardLayout orgId={params.orgId}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-display font-bold text-primary">Análise: {survey.title}</h1>
            <p className="text-muted-foreground">Insights em tempo real e trilha de auditoria</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button 
              variant="outline" 
              onClick={exportToCSV}
              data-testid="button-export-csv"
            >
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              Exportar CSV
            </Button>
            <Badge variant={survey.status === 'active' ? 'default' : 'secondary'} className="w-fit">
              {survey.status === 'active' ? 'Pesquisa Ativa' : 'Pesquisa Pausada'}
            </Badge>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <div className="text-2xl font-bold" data-testid="text-total-responses">{analytics.totalResponses}</div>
                {survey.targetSample && (
                  <span className="text-xs text-muted-foreground">/ {survey.targetSample}</span>
                )}
              </div>
              <div className="w-full bg-muted rounded-full h-1.5 mt-2">
                <div 
                  className="bg-primary h-1.5 rounded-full transition-all" 
                  style={{ width: `${analytics.completionRate}%` }}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Válidas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-500" />
                <span className="text-2xl font-bold text-green-600" data-testid="text-valid">{analytics.validResponses}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {analytics.totalResponses > 0 ? Math.round((analytics.validResponses / analytics.totalResponses) * 100) : 0}% do total
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Suspeitas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                <span className={`text-2xl font-bold ${analytics.suspiciousResponses > 0 ? 'text-amber-600' : 'text-green-600'}`} data-testid="text-suspicious">
                  {analytics.suspiciousResponses}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {analytics.totalResponses > 0 ? Math.round((analytics.suspiciousResponses / analytics.totalResponses) * 100) : 0}% do total
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Duração Média</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-primary" />
                <span className="text-2xl font-bold" data-testid="text-avg-duration">{formatDuration(analytics.averageDuration)}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Por entrevista</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Precisão GPS</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-blue-500" />
                <span className="text-2xl font-bold" data-testid="text-avg-accuracy">{analytics.averageAccuracy}m</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Média geral</p>
            </CardContent>
          </Card>
        </div>

        {/* Charts Tabs */}
        <Tabs defaultValue="timeline" className="w-full">
          <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
            <TabsTrigger value="timeline" data-testid="tab-timeline">Linha do Tempo</TabsTrigger>
            <TabsTrigger value="distribution" data-testid="tab-distribution">Distribuição</TabsTrigger>
            <TabsTrigger value="interviewers" data-testid="tab-interviewers">Entrevistadores</TabsTrigger>
            <TabsTrigger value="map" data-testid="tab-map">Mapa</TabsTrigger>
          </TabsList>

          <TabsContent value="timeline" className="mt-4">
            <div className="grid lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="w-5 h-5" />
                    Entrevistas por Dia
                  </CardTitle>
                  <CardDescription>Últimos 14 dias de coleta</CardDescription>
                </CardHeader>
                <CardContent className="h-[300px]">
                  {analytics.dailyData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={analytics.dailyData}>
                        <defs>
                          <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="date" fontSize={12} />
                        <YAxis fontSize={12} />
                        <Tooltip 
                          formatter={(value: number, name: string) => {
                            const labels: Record<string, string> = { total: 'Total', valid: 'Válidas', suspicious: 'Suspeitas' };
                            return [value, labels[name] || name];
                          }}
                        />
                        <Area type="monotone" dataKey="total" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorTotal)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      <p>Nenhuma entrevista realizada ainda</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="w-5 h-5" />
                    Entrevistas por Hora
                  </CardTitle>
                  <CardDescription>Distribuição ao longo do dia</CardDescription>
                </CardHeader>
                <CardContent className="h-[300px]">
                  {analytics.hourlyData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analytics.hourlyData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="hour" fontSize={12} />
                        <YAxis fontSize={12} />
                        <Tooltip formatter={(value: number) => [`${value} entrevistas`, 'Quantidade']} />
                        <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      <p>Nenhuma entrevista realizada ainda</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="distribution" className="mt-4">
            <div className="grid lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Status das Entrevistas</CardTitle>
                  <CardDescription>Distribuição por validação</CardDescription>
                </CardHeader>
                <CardContent className="h-[300px]">
                  {analytics.statusDistribution.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={analytics.statusDistribution}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={5}
                          dataKey="value"
                          label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                        >
                          {analytics.statusDistribution.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: number) => [`${value} entrevistas`, 'Quantidade']} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      <p>Nenhuma entrevista realizada ainda</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="w-5 h-5" />
                    Precisão do GPS
                  </CardTitle>
                  <CardDescription>Qualidade da localização capturada</CardDescription>
                </CardHeader>
                <CardContent className="h-[300px]">
                  {analytics.accuracyDistribution.some(d => d.count > 0) ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analytics.accuracyDistribution} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" fontSize={12} />
                        <YAxis type="category" dataKey="range" fontSize={12} width={60} />
                        <Tooltip formatter={(value: number) => [`${value} entrevistas`, 'Quantidade']} />
                        <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      <p>Nenhuma entrevista realizada ainda</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="interviewers" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Desempenho por Entrevistador
                </CardTitle>
                <CardDescription>Ranking baseado em produtividade e qualidade</CardDescription>
              </CardHeader>
              <CardContent>
                {analytics.interviewerStats.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted text-muted-foreground uppercase text-xs font-medium">
                        <tr>
                          <th className="px-4 py-3 text-left">#</th>
                          <th className="px-4 py-3 text-left">Entrevistador</th>
                          <th className="px-4 py-3 text-center">Total</th>
                          <th className="px-4 py-3 text-center">Válidas</th>
                          <th className="px-4 py-3 text-center">Suspeitas</th>
                          <th className="px-4 py-3 text-center">Taxa de Sucesso</th>
                          <th className="px-4 py-3 text-center">Duração Média</th>
                          <th className="px-4 py-3 text-center">Precisão GPS</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {analytics.interviewerStats.map((interviewer, index) => (
                          <tr key={interviewer.id} className="hover:bg-muted/30" data-testid={`row-interviewer-${index}`}>
                            <td className="px-4 py-3 font-bold text-muted-foreground">{index + 1}</td>
                            <td className="px-4 py-3 font-medium">{interviewer.id.substring(0, 12)}...</td>
                            <td className="px-4 py-3 text-center font-bold">{interviewer.total}</td>
                            <td className="px-4 py-3 text-center text-green-600">{interviewer.valid}</td>
                            <td className="px-4 py-3 text-center text-amber-600">{interviewer.suspicious}</td>
                            <td className="px-4 py-3 text-center">
                              <Badge variant={interviewer.successRate >= 90 ? 'default' : interviewer.successRate >= 70 ? 'secondary' : 'destructive'}>
                                {interviewer.successRate}%
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-center">{formatDuration(interviewer.avgDuration)}</td>
                            <td className="px-4 py-3 text-center">{interviewer.avgAccuracy}m</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="py-12 text-center text-muted-foreground">
                    <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Nenhuma entrevista realizada ainda</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="map" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="w-5 h-5" />
                  Cobertura Geográfica
                </CardTitle>
                <CardDescription>Localização de todas as entrevistas coletadas</CardDescription>
              </CardHeader>
              <CardContent className="h-[500px] p-0 overflow-hidden rounded-b-xl">
                <MapView responses={responses} height="500px" />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Audit Trail Table */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Mic className="w-5 h-5" />
                  Trilha de Auditoria
                </CardTitle>
                <CardDescription>Registro detalhado de todas as entrevistas</CardDescription>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  placeholder="Buscar por ID ou entrevistador..."
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                  className="w-full sm:w-64"
                  data-testid="input-search-audit"
                />
                <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setCurrentPage(1); }}>
                  <SelectTrigger className="w-full sm:w-40" data-testid="select-status-filter">
                    <Filter className="w-4 h-4 mr-2" />
                    <SelectValue placeholder="Filtrar status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="valid">Válidas</SelectItem>
                    <SelectItem value="suspicious">Suspeitas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted text-muted-foreground uppercase text-xs font-medium">
                  <tr>
                    <th className="px-4 py-3">ID</th>
                    <th className="px-4 py-3">Data/Hora</th>
                    <th className="px-4 py-3">Entrevistador</th>
                    <th className="px-4 py-3">Duração</th>
                    <th className="px-4 py-3">Localização</th>
                    <th className="px-4 py-3">Precisão</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Áudio</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {paginatedResponses.length > 0 ? (
                    paginatedResponses.map(resp => (
                      <tr key={resp.id} className="hover:bg-muted/30" data-testid={`row-response-${resp.id}`}>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">#{resp.id}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{new Date(resp.createdAt!).toLocaleString('pt-BR')}</td>
                        <td className="px-4 py-3 font-mono text-xs">{resp.interviewerId?.substring(0, 12)}...</td>
                        <td className="px-4 py-3">{formatDuration(resp.duration || 0)}</td>
                        <td className="px-4 py-3 font-mono text-xs">
                          <a 
                            href={`https://www.google.com/maps?q=${resp.latitude},${resp.longitude}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline inline-flex items-center gap-1"
                            data-testid={`link-map-${resp.id}`}
                          >
                            {resp.latitude?.toFixed(4)}, {resp.longitude?.toFixed(4)}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </td>
                        <td className="px-4 py-3">
                          <span className={resp.accuracy > 50 ? 'text-amber-600 font-medium' : ''}>
                            {resp.accuracy.toFixed(1)}m
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={resp.status === 'valid' ? 'default' : 'destructive'}>
                            {getStatusLabel(resp.status)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          {resp.audioUrl ? (
                            <a 
                              href={resp.audioUrl} 
                              target="_blank" 
                              className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                              data-testid={`link-audio-${resp.id}`}
                            >
                              <Play className="w-3 h-3" /> Ouvir
                            </a>
                          ) : (
                            <span className="text-muted-foreground text-xs">N/D</span>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                        {responses.length === 0 ? 'Nenhuma entrevista realizada ainda' : 'Nenhum resultado encontrado'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <p className="text-sm text-muted-foreground">
                  Mostrando {(currentPage - 1) * itemsPerPage + 1} a {Math.min(currentPage * itemsPerPage, filteredResponses.length)} de {filteredResponses.length}
                </p>
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    data-testid="button-prev-page"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-sm px-2">
                    Página {currentPage} de {totalPages}
                  </span>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    data-testid="button-next-page"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
