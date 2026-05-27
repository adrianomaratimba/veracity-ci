import { useState, useMemo, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { useOrgResponses, useUpdateResponseStatus } from "@/hooks/use-audit";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { AlertTriangle, CheckCircle, XCircle, MapPin, Clock, FileAudio, Search, Filter, Eye, Users, ClipboardList, CheckSquare, Square } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useQuery } from "@tanstack/react-query";
import { useSurveys } from "@/hooks/use-surveys";

interface AuditPageProps {
  params: { orgId: string };
}

interface InterviewerComparison {
  interviewers: Array<{ id: string; name: string; totalResponses: number }>;
  questions: Array<{ id: number; text: string; options: string[] }>;
  comparison: Array<{
    questionId: number;
    questionText: string;
    byInterviewer: Array<{
      interviewerId: string;
      interviewerName: string;
      totalForQuestion: number;
      distribution: Array<{ option: string; count: number; percentage: number }>;
    }>;
    groupAverage: Array<{ option: string; avgPercentage: number }>;
    discrepancies: Array<{ interviewerId: string; interviewerName: string; option: string; deviation: number }>;
  }>;
}

export default function AuditPage({ params }: AuditPageProps) {
  const orgId = parseInt(params.orgId);
  const { data: responses, isLoading } = useOrgResponses(orgId);
  const updateStatus = useUpdateResponseStatus();
  const { toast } = useToast();
  const { data: surveys } = useSurveys(orgId);

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedResponse, setSelectedResponse] = useState<any | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("entrevistas");
  
  // Batch selection state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);

  // Filtros para aba Entrevistadores
  const [selectedSurveyId, setSelectedSurveyId] = useState<string>("all");
  const [selectedQuestionId, setSelectedQuestionId] = useState<string>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  // Query para comparação de entrevistadores
  const { data: comparisonData, isLoading: comparisonLoading } = useQuery<InterviewerComparison>({
    queryKey: ['/api/organizations', orgId, 'audit/interviewers', selectedSurveyId, selectedQuestionId, startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedSurveyId !== "all") params.append("surveyId", selectedSurveyId);
      if (selectedQuestionId !== "all") params.append("questionId", selectedQuestionId);
      if (startDate) params.append("startDate", startDate);
      if (endDate) params.append("endDate", endDate);
      const res = await fetch(`/api/organizations/${orgId}/audit/interviewers?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error("Erro ao carregar dados");
      return res.json();
    },
    enabled: activeTab === "entrevistadores"
  });

  const filteredResponses = useMemo(() => {
    if (!responses) return [];
    return responses.filter(r => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          r.survey.title.toLowerCase().includes(query) ||
          r.interviewerId.toLowerCase().includes(query) ||
          String(r.id).includes(query)
        );
      }
      return true;
    });
  }, [responses, statusFilter, searchQuery]);

  const suspiciousCount = responses?.filter(r => r.status === 'suspicious').length || 0;
  const validCount = responses?.filter(r => r.status === 'valid').length || 0;
  const invalidCount = responses?.filter(r => r.status === 'invalid').length || 0;

  // Clear selection when filters change to prevent updating hidden rows
  useEffect(() => {
    setSelectedIds(new Set());
  }, [statusFilter, searchQuery]);

  // Calculate select-all state (true, false, or "indeterminate")
  const selectAllState = useMemo(() => {
    if (filteredResponses.length === 0) return false;
    const selectedInFilter = filteredResponses.filter(r => selectedIds.has(r.id)).length;
    if (selectedInFilter === 0) return false;
    if (selectedInFilter === filteredResponses.length) return true;
    return "indeterminate";
  }, [filteredResponses, selectedIds]);

  const handleApprove = async (responseId: number) => {
    try {
      await updateStatus.mutateAsync({ responseId, status: 'valid', reviewNote: reviewNote || undefined });
      toast({ title: "Aprovada", description: "Entrevista marcada como valida" });
      setDetailDialogOpen(false);
      setSelectedResponse(null);
      setReviewNote("");
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  const handleReject = async (responseId: number) => {
    try {
      await updateStatus.mutateAsync({ responseId, status: 'invalid', reviewNote: reviewNote || undefined });
      toast({ title: "Invalidada", description: "Entrevista marcada como invalida" });
      setDetailDialogOpen(false);
      setSelectedResponse(null);
      setReviewNote("");
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  const openDetail = (response: any) => {
    setSelectedResponse(response);
    setReviewNote(response.reviewNote || "");
    setDetailDialogOpen(true);
  };

  // Batch selection handlers
  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectAllState === true) {
      // All selected, so deselect all
      setSelectedIds(new Set());
    } else {
      // None or partial selected, so select all filtered
      setSelectedIds(new Set(filteredResponses.map(r => r.id)));
    }
  };

  const handleBulkUpdate = async (status: 'valid' | 'invalid') => {
    if (selectedIds.size === 0) return;
    
    const count = selectedIds.size;
    setIsBulkUpdating(true);
    try {
      await apiRequest(
        'POST',
        `/api/organizations/${orgId}/audit/responses/bulk-update`,
        {
          responseIds: Array.from(selectedIds),
          status
        }
      );
      
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', orgId, 'responses'] });
      setSelectedIds(new Set());
      toast({ 
        title: status === 'valid' ? "Aprovadas" : "Invalidadas",
        description: `${count} entrevista(s) atualizadas com sucesso`
      });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setIsBulkUpdating(false);
    }
  };

  // Função para determinar cor baseado no desvio
  const getDeviationColor = (percentage: number, avgPercentage: number) => {
    const deviation = Math.abs(percentage - avgPercentage);
    if (deviation > 20) return "bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 font-bold";
    if (deviation > 15) return "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 font-semibold";
    if (deviation > 10) return "bg-yellow-50 dark:bg-yellow-950 text-yellow-700 dark:text-yellow-300";
    return "";
  };

  // Perguntas disponíveis baseadas na pesquisa selecionada
  const availableQuestions = useMemo(() => {
    if (!comparisonData) return [];
    return comparisonData.questions;
  }, [comparisonData]);

  if (isLoading) return <LoadingScreen />;

  return (
    <DashboardLayout orgId={params.orgId}>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-display font-bold">Auditoria de Entrevistas</h1>
          <p className="text-muted-foreground">Revise entrevistas e compare resultados entre entrevistadores</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="entrevistas" className="gap-2" data-testid="tab-entrevistas">
              <ClipboardList className="w-4 h-4" /> Entrevistas
            </TabsTrigger>
            <TabsTrigger value="entrevistadores" className="gap-2" data-testid="tab-entrevistadores">
              <Users className="w-4 h-4" /> Entrevistadores
            </TabsTrigger>
          </TabsList>

          <TabsContent value="entrevistas" className="mt-6 space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-total-audit">{responses?.length || 0}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Suspeitas</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-500" />
                    <span className={`text-2xl font-bold ${suspiciousCount > 0 ? 'text-amber-600' : 'text-green-600'}`} data-testid="text-suspicious-audit">
                      {suspiciousCount}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Validas</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    <span className="text-2xl font-bold text-green-600" data-testid="text-valid-audit">{validCount}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Invalidas</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <XCircle className="w-5 h-5 text-red-500" />
                    <span className="text-2xl font-bold text-red-600" data-testid="text-invalid-audit">{invalidCount}</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Filter className="w-5 h-5" />
                  Filtros
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-4">
                  <div className="flex-1 min-w-[200px]">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="Buscar por pesquisa, entrevistador ou ID..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                        data-testid="input-search-audit"
                      />
                    </div>
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[180px]" data-testid="select-status-filter">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os Status</SelectItem>
                      <SelectItem value="suspicious">Suspeitas</SelectItem>
                      <SelectItem value="valid">Validas</SelectItem>
                      <SelectItem value="invalid">Invalidas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <CardTitle>Lista de Entrevistas</CardTitle>
                    <CardDescription>{filteredResponses.length} entrevistas encontradas</CardDescription>
                  </div>
                  {selectedIds.size > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">{selectedIds.size} selecionada(s)</span>
                      <Button 
                        size="sm" 
                        onClick={() => handleBulkUpdate('valid')}
                        disabled={isBulkUpdating}
                        data-testid="button-bulk-approve"
                      >
                        <CheckCircle className="w-4 h-4 mr-1" />
                        Aprovar
                      </Button>
                      <Button 
                        size="sm" 
                        variant="destructive"
                        onClick={() => handleBulkUpdate('invalid')}
                        disabled={isBulkUpdating}
                        data-testid="button-bulk-invalidate"
                      >
                        <XCircle className="w-4 h-4 mr-1" />
                        Invalidar
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {filteredResponses.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    Nenhuma entrevista encontrada com os filtros aplicados
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 pb-2 border-b">
                      <Checkbox
                        checked={selectAllState}
                        onCheckedChange={toggleSelectAll}
                        data-testid="checkbox-select-all"
                      />
                      <span className="text-sm text-muted-foreground">Selecionar todas</span>
                    </div>
                    {filteredResponses.map((response) => (
                      <div
                        key={response.id}
                        className="flex items-center justify-between p-4 border rounded-lg hover-elevate cursor-pointer"
                        onClick={() => openDetail(response)}
                        data-testid={`row-response-${response.id}`}
                      >
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                          <div onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={selectedIds.has(response.id)}
                              onCheckedChange={() => toggleSelect(response.id)}
                              data-testid={`checkbox-response-${response.id}`}
                            />
                          </div>
                          <div className="flex-shrink-0">
                            {response.status === 'suspicious' && <AlertTriangle className="w-5 h-5 text-amber-500" />}
                            {response.status === 'valid' && <CheckCircle className="w-5 h-5 text-green-500" />}
                            {response.status === 'invalid' && <XCircle className="w-5 h-5 text-red-500" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <p className="font-medium truncate">{response.survey.title}</p>
                              {(response as any).deviceInfo?.imported && (
                                <Badge variant="outline" className="text-xs border-blue-400 text-blue-600 bg-blue-50 dark:bg-blue-950/30 shrink-0" data-testid={`badge-imported-${response.id}`}>
                                  Importado
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                              <span className="flex items-center gap-1">
                                <Users className="w-3 h-3" />
                                {(response as any).deviceInfo?.originalInterviewerName
                                  ? (response as any).deviceInfo.originalInterviewerName
                                  : (response as any).interviewer 
                                    ? `${(response as any).interviewer.firstName || ''} ${(response as any).interviewer.lastName || ''}`.trim() || 'Sem nome'
                                    : 'Desconhecido'}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {response.createdAt ? format(new Date(response.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR }) : '-'}
                              </span>
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                {response.accuracy?.toFixed(0)}m
                              </span>
                              {response.flagReason && (
                                <span className="text-amber-600 truncate" title={response.flagReason}>
                                  {response.flagReason}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          {(response as any).fraudScore != null && (
                            <Badge
                              variant="outline"
                              className={
                                (response as any).fraudScore >= 70 ? 'border-red-500 text-red-600 bg-red-50 dark:bg-red-950/30' :
                                (response as any).fraudScore >= 40 ? 'border-amber-500 text-amber-600 bg-amber-50 dark:bg-amber-950/30' :
                                'border-green-500 text-green-600 bg-green-50 dark:bg-green-950/30'
                              }
                              title="Pontuação de risco de fraude (0-100)"
                              data-testid={`badge-fraud-score-${response.id}`}
                            >
                              IA {(response as any).fraudScore}
                            </Badge>
                          )}
                          <Badge variant={
                            response.status === 'suspicious' ? 'outline' :
                            response.status === 'valid' ? 'default' : 'destructive'
                          }>
                            {response.status === 'suspicious' ? 'Suspeita' :
                             response.status === 'valid' ? 'Valida' : 'Invalida'}
                          </Badge>
                          <Button variant="ghost" size="icon" onClick={() => openDetail(response)} data-testid={`button-view-${response.id}`}>
                            <Eye className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="entrevistadores" className="mt-6 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Filter className="w-5 h-5" />
                  Filtros de Comparacao
                </CardTitle>
                <CardDescription>Selecione a pesquisa e pergunta para comparar os resultados entre entrevistadores</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-4">
                  <div className="min-w-[200px]">
                    <Label className="text-sm text-muted-foreground mb-2 block">Pesquisa</Label>
                    <Select value={selectedSurveyId} onValueChange={(v) => { setSelectedSurveyId(v); setSelectedQuestionId("all"); }}>
                      <SelectTrigger data-testid="select-survey-filter">
                        <SelectValue placeholder="Todas as pesquisas" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas as pesquisas</SelectItem>
                        {surveys?.map(s => (
                          <SelectItem key={s.id} value={String(s.id)}>{s.title}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-[250px] flex-1">
                    <Label className="text-sm text-muted-foreground mb-2 block">Pergunta</Label>
                    <Select value={selectedQuestionId} onValueChange={setSelectedQuestionId}>
                      <SelectTrigger data-testid="select-question-filter">
                        <SelectValue placeholder="Todas as perguntas" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas as perguntas</SelectItem>
                        {availableQuestions.map(q => (
                          <SelectItem key={q.id} value={String(q.id)}>{q.text}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-[140px]">
                    <Label className="text-sm text-muted-foreground mb-2 block">Data Inicio</Label>
                    <Input 
                      type="date" 
                      value={startDate} 
                      onChange={(e) => setStartDate(e.target.value)}
                      data-testid="input-start-date"
                    />
                  </div>
                  <div className="min-w-[140px]">
                    <Label className="text-sm text-muted-foreground mb-2 block">Data Fim</Label>
                    <Input 
                      type="date" 
                      value={endDate} 
                      onChange={(e) => setEndDate(e.target.value)}
                      data-testid="input-end-date"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {comparisonLoading ? (
              <Card>
                <CardContent className="py-12">
                  <div className="text-center text-muted-foreground">Carregando dados de comparacao...</div>
                </CardContent>
              </Card>
            ) : !comparisonData || comparisonData.comparison.length === 0 ? (
              <Card>
                <CardContent className="py-12">
                  <div className="text-center text-muted-foreground">
                    <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p className="font-medium">Nenhum dado disponivel</p>
                    <p className="text-sm mt-1">Selecione uma pesquisa com respostas coletadas para ver a comparacao</p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Resumo de Entrevistadores */}
                <Card>
                  <CardHeader>
                    <CardTitle>Entrevistadores Analisados</CardTitle>
                    <CardDescription>{comparisonData.interviewers.length} entrevistadores com respostas</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-3">
                      {comparisonData.interviewers.map(int => (
                        <Badge key={int.id} variant="secondary" className="py-1.5 px-3">
                          {int.name} ({int.totalResponses} respostas)
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Tabela Comparativa por Pergunta */}
                {comparisonData.comparison.map(q => (
                  <Card key={q.questionId}>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <CardTitle className="text-base">{q.questionText}</CardTitle>
                          {q.discrepancies.length > 0 && (
                            <div className="flex items-center gap-2 mt-2">
                              <AlertTriangle className="w-4 h-4 text-amber-500" />
                              <span className="text-sm text-amber-600">{q.discrepancies.length} discrepancia(s) detectada(s)</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="w-full">
                        <div className="min-w-[600px]">
                          <table className="w-full border-collapse">
                            <thead>
                              <tr className="border-b">
                                <th className="text-left p-3 font-medium text-muted-foreground bg-muted/50">Opcao</th>
                                <th className="text-center p-3 font-medium text-muted-foreground bg-muted/50 min-w-[80px]">Media</th>
                                {q.byInterviewer.map(int => (
                                  <th key={int.interviewerId} className="text-center p-3 font-medium min-w-[100px]">
                                    <div className="truncate max-w-[100px]" title={int.interviewerName}>
                                      {int.interviewerName.split(' ')[0]}
                                    </div>
                                    <div className="text-xs text-muted-foreground font-normal">({int.totalForQuestion})</div>
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {q.groupAverage.map((avg, idx) => (
                                <tr key={avg.option} className={idx % 2 === 0 ? 'bg-muted/20' : ''}>
                                  <td className="p-3 font-medium">{avg.option}</td>
                                  <td className="p-3 text-center font-medium bg-muted/30">{avg.avgPercentage.toFixed(1)}%</td>
                                  {q.byInterviewer.map(int => {
                                    const dist = int.distribution.find(d => d.option === avg.option);
                                    const pct = dist?.percentage || 0;
                                    const colorClass = getDeviationColor(pct, avg.avgPercentage);
                                    return (
                                      <td 
                                        key={int.interviewerId} 
                                        className={`p-3 text-center ${colorClass}`}
                                        data-testid={`cell-${q.questionId}-${int.interviewerId}-${avg.option}`}
                                      >
                                        {pct.toFixed(1)}%
                                        {dist && <span className="text-xs text-muted-foreground ml-1">({dist.count})</span>}
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <ScrollBar orientation="horizontal" />
                      </ScrollArea>

                      {/* Legenda */}
                      <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground border-t pt-4">
                        <span className="flex items-center gap-2">
                          <div className="w-4 h-4 bg-red-100 dark:bg-red-950 border rounded" /> Desvio maior que 20%
                        </span>
                        <span className="flex items-center gap-2">
                          <div className="w-4 h-4 bg-amber-100 dark:bg-amber-950 border rounded" /> Desvio entre 15-20%
                        </span>
                        <span className="flex items-center gap-2">
                          <div className="w-4 h-4 bg-yellow-50 dark:bg-yellow-950 border rounded" /> Desvio entre 10-15%
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhes da Entrevista #{selectedResponse?.id}</DialogTitle>
            <DialogDescription>
              Revise as informacoes e decida se a entrevista e valida
            </DialogDescription>
          </DialogHeader>

          {selectedResponse && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground text-xs">Pesquisa</Label>
                  <p className="font-medium">{selectedResponse.survey.title}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">Data/Hora</Label>
                  <p className="font-medium">
                    {selectedResponse.createdAt ? format(new Date(selectedResponse.createdAt), "dd/MM/yyyy 'as' HH:mm", { locale: ptBR }) : '-'}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">Duracao</Label>
                  <p className="font-medium">{selectedResponse.duration || 0} segundos</p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">Precisao GPS</Label>
                  <p className={`font-medium ${selectedResponse.accuracy > 50 ? 'text-amber-600' : 'text-green-600'}`}>
                    {selectedResponse.accuracy?.toFixed(1)}m
                  </p>
                </div>
              </div>

              <div className="p-4 bg-muted rounded-lg">
                <Label className="text-muted-foreground text-xs">Coordenadas</Label>
                <p className="font-mono text-sm">
                  {selectedResponse.latitude?.toFixed(6)}, {selectedResponse.longitude?.toFixed(6)}
                </p>
                <a
                  href={`https://www.google.com/maps?q=${selectedResponse.latitude},${selectedResponse.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary text-sm underline"
                >
                  Ver no Google Maps
                </a>
              </div>

              {(selectedResponse as any).fraudScore != null && (
                <div className={`p-4 rounded-lg border ${
                  (selectedResponse as any).fraudScore >= 70 ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800' :
                  (selectedResponse as any).fraudScore >= 40 ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800' :
                  'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800'
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className={`w-4 h-4 ${
                        (selectedResponse as any).fraudScore >= 70 ? 'text-red-600' :
                        (selectedResponse as any).fraudScore >= 40 ? 'text-amber-600' : 'text-green-600'
                      }`} />
                      <Label className="font-medium">Pontuação de Risco IA</Label>
                    </div>
                    <span className={`text-2xl font-bold ${
                      (selectedResponse as any).fraudScore >= 70 ? 'text-red-600' :
                      (selectedResponse as any).fraudScore >= 40 ? 'text-amber-600' : 'text-green-600'
                    }`} data-testid="text-fraud-score-detail">
                      {(selectedResponse as any).fraudScore}/100
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {(selectedResponse as any).fraudScore >= 70 ? 'Alto risco — revisão urgente recomendada.' :
                     (selectedResponse as any).fraudScore >= 40 ? 'Risco moderado — verifique os dados.' :
                     'Baixo risco — entrevista provavelmente legítima.'}
                  </p>
                </div>
              )}

              {selectedResponse.flagReason && (
                <div className="p-4 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <div className="flex items-center gap-2 text-amber-600">
                    <AlertTriangle className="w-4 h-4" />
                    <Label className="font-medium">Motivo da Suspeita</Label>
                  </div>
                  <p className="mt-1 text-sm">{selectedResponse.flagReason}</p>
                </div>
              )}

              {selectedResponse.audioUrl && (
                <div>
                  <Label className="text-muted-foreground text-xs">Gravacao de Audio</Label>
                  <div className="mt-2 p-3 bg-muted rounded-lg flex items-center gap-3">
                    <FileAudio className="w-5 h-5 text-muted-foreground" />
                    <audio controls className="flex-1" data-testid="audio-player">
                      <source src={selectedResponse.audioUrl} type="audio/webm" />
                      Seu navegador nao suporta o elemento de audio.
                    </audio>
                  </div>
                </div>
              )}

              <div>
                <Label htmlFor="reviewNote">Nota de Revisao (opcional)</Label>
                <Textarea
                  id="reviewNote"
                  placeholder="Adicione uma observacao sobre sua decisao..."
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  data-testid="input-review-note"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDetailDialogOpen(false)}>
              Cancelar
            </Button>
            {selectedResponse?.status === 'suspicious' && (
              <>
                <Button
                  variant="destructive"
                  onClick={() => selectedResponse && handleReject(selectedResponse.id)}
                  disabled={updateStatus.isPending}
                  data-testid="button-reject"
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Invalidar
                </Button>
                <Button
                  onClick={() => selectedResponse && handleApprove(selectedResponse.id)}
                  disabled={updateStatus.isPending}
                  data-testid="button-approve"
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Aprovar
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
