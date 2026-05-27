import { useOrganization, useCurrentMember } from "@/hooks/use-organizations";
import { useSurveys, useCreateSurvey, useUpdateSurvey, useTrashedSurveys, useTrashSurvey, useRestoreSurvey, useDeleteSurvey, useDuplicateSurvey } from "@/hooks/use-surveys";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import { Plus, FileText, MoreVertical, Play, BarChart3, Edit, ExternalLink, Copy, Trash2, Pencil, RotateCcw, Archive, Download, Upload, Loader2, Check, FileSpreadsheet, CheckCircle2 } from "lucide-react";
import { useOfflineCache } from "@/hooks/use-offline-cache";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { canManageSurveys, canViewAnalytics, isInterviewerRole, type UserRole } from "@shared/rbac";
import type { Survey } from "@shared/schema";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function SurveysPage({ params }: { params: { orgId: string } }) {
  const orgId = parseInt(params.orgId);
  const { data: org, isLoading: orgLoading } = useOrganization(orgId);
  const { data: surveys, isLoading: surveysLoading } = useSurveys(orgId);
  const { data: trashedSurveys, isLoading: trashLoading } = useTrashedSurveys(orgId);
  const { data: currentMember, isLoading: memberLoading } = useCurrentMember(orgId);
  const createSurvey = useCreateSurvey();
  const updateSurvey = useUpdateSurvey();
  const trashSurvey = useTrashSurvey();
  const restoreSurvey = useRestoreSurvey();
  const deleteSurvey = useDeleteSurvey();
  const duplicateSurvey = useDuplicateSurvey();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [surveyToRename, setSurveyToRename] = useState<Survey | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [activeTab, setActiveTab] = useState("active");
  const [trashConfirmOpen, setTrashConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [surveyToAction, setSurveyToAction] = useState<Survey | null>(null);
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [duplicateTitle, setDuplicateTitle] = useState("");
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importActiveTab, setImportActiveTab] = useState("json");
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState<number | null>(null);
  const [isImportingCsv, setIsImportingCsv] = useState(false);
  const [csvPreviewData, setCsvPreviewData] = useState<{ headers: string[]; rows: Array<{ timestamp: string; interviewerName: string; answers: string[] }> } | null>(null);
  const [csvSurveyTitle, setCsvSurveyTitle] = useState("");
  const [preparingOffline, setPreparingOffline] = useState<Set<number>>(new Set());
  const [offlineReadySurveys, setOfflineReadySurveys] = useState<Set<number>>(new Set());
  const { prepareOffline } = useOfflineCache();

  const userRole = (currentMember?.role || 'viewer') as UserRole;
  const canImportExport = userRole === 'owner' || userRole === 'admin';
  const canCreate = canManageSurveys(userRole);
  const canEdit = canManageSurveys(userRole);
  const canSeeResults = canViewAnalytics(userRole);
  const isInterviewer = isInterviewerRole(userRole);
  const isViewer = userRole === 'viewer';
  const canAccessCollection = !isViewer && (isInterviewer || userRole === 'admin' || userRole === 'owner' || userRole === 'coordinator');
  
  const [newSurvey, setNewSurvey] = useState({
    title: "",
    description: "",
    type: "electoral",
    location: "",
    targetSample: 400
  });

  const handlePrepareOffline = async (surveyId: number) => {
    if (!navigator.onLine) {
      toast({ title: "Sem conexão", description: "Conecte à internet para preparar o uso offline.", variant: "destructive" });
      return;
    }
    setPreparingOffline(prev => new Set([...prev, surveyId]));
    try {
      await prepareOffline(surveyId, orgId);
      setOfflineReadySurveys(prev => new Set([...prev, surveyId]));
      toast({ title: "Pronto para uso offline", description: "Pesquisa e perguntas salvas no dispositivo." });
    } catch {
      toast({ title: "Erro", description: "Não foi possível preparar o cache offline.", variant: "destructive" });
    } finally {
      setPreparingOffline(prev => { const s = new Set(prev); s.delete(surveyId); return s; });
    }
  };

  const handleOpenRename = (survey: Survey) => {
    setSurveyToRename(survey);
    setNewTitle(survey.title);
    setRenameDialogOpen(true);
  };

  const handleRename = async () => {
    if (!surveyToRename || !newTitle.trim()) {
      toast({ title: "Erro", description: "O título é obrigatório", variant: "destructive" });
      return;
    }
    try {
      await updateSurvey.mutateAsync({
        id: surveyToRename.id,
        orgId,
        data: { title: newTitle.trim() }
      });
      toast({ title: "Sucesso", description: "Nome da pesquisa atualizado!" });
      setRenameDialogOpen(false);
      setSurveyToRename(null);
      setNewTitle("");
    } catch (error) {
      toast({ title: "Erro", description: "Falha ao renomear pesquisa", variant: "destructive" });
    }
  };

  const handleTrash = async () => {
    if (!surveyToAction) return;
    try {
      await trashSurvey.mutateAsync({ id: surveyToAction.id, orgId });
      toast({ title: "Sucesso", description: "Pesquisa movida para a lixeira" });
      setTrashConfirmOpen(false);
      setSurveyToAction(null);
    } catch (error) {
      toast({ title: "Erro", description: "Falha ao mover para lixeira", variant: "destructive" });
    }
  };

  const handleRestore = async (survey: Survey) => {
    try {
      await restoreSurvey.mutateAsync({ id: survey.id, orgId });
      toast({ title: "Sucesso", description: "Pesquisa restaurada!" });
    } catch (error) {
      toast({ title: "Erro", description: "Falha ao restaurar pesquisa", variant: "destructive" });
    }
  };

  const handlePermanentDelete = async () => {
    if (!surveyToAction) return;
    try {
      await deleteSurvey.mutateAsync({ id: surveyToAction.id, orgId });
      toast({ title: "Sucesso", description: "Pesquisa excluída permanentemente" });
      setDeleteConfirmOpen(false);
      setSurveyToAction(null);
    } catch (error) {
      toast({ title: "Erro", description: "Falha ao excluir pesquisa", variant: "destructive" });
    }
  };

  const handleDuplicate = async () => {
    if (!surveyToAction) return;
    try {
      const result = await duplicateSurvey.mutateAsync({ 
        id: surveyToAction.id, 
        orgId,
        title: duplicateTitle || `${surveyToAction.title} (Cópia)`
      });
      toast({ title: "Sucesso", description: "Pesquisa duplicada!" });
      setDuplicateDialogOpen(false);
      setSurveyToAction(null);
      setDuplicateTitle("");
      setLocation(`/org/${orgId}/surveys/${result.survey.id}`);
    } catch (error) {
      toast({ title: "Erro", description: "Falha ao duplicar pesquisa", variant: "destructive" });
    }
  };

  const openDuplicateDialog = (survey: Survey) => {
    setSurveyToAction(survey);
    setDuplicateTitle(`${survey.title} (Cópia)`);
    setDuplicateDialogOpen(true);
  };

  const openTrashConfirm = (survey: Survey) => {
    setSurveyToAction(survey);
    setTrashConfirmOpen(true);
  };

  const openDeleteConfirm = (survey: Survey) => {
    setSurveyToAction(survey);
    setDeleteConfirmOpen(true);
  };

  const handleExportTemplate = async (surveyId: number, surveyTitle: string) => {
    setIsExporting(surveyId);
    try {
      const response = await fetch(`/api/surveys/${surveyId}/export-template`, {
        credentials: 'include',
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Erro ao exportar');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${surveyTitle.replace(/[^a-zA-Z0-9]/g, '_')}_template.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({ title: "Sucesso", description: "Template exportado! Você pode importá-lo em qualquer organização." });
    } catch (error: any) {
      toast({ title: "Erro", description: error.message || "Falha ao exportar template", variant: "destructive" });
    } finally {
      setIsExporting(null);
    }
  };

  const handleImportTemplate = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setIsImporting(true);
    try {
      const text = await file.text();
      const template = JSON.parse(text);
      
      const response = await fetch(`/api/organizations/${orgId}/surveys/import-template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(template),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Erro ao importar');
      }
      
      const result = await response.json();
      toast({ 
        title: "Sucesso", 
        description: `Pesquisa importada com ${result.questionsImported} perguntas!` 
      });
      setImportDialogOpen(false);
      // Refresh surveys list
      window.location.reload();
    } catch (error: any) {
      toast({ 
        title: "Erro", 
        description: error.message || "Falha ao importar template. Verifique se o arquivo é válido.", 
        variant: "destructive" 
      });
    } finally {
      setIsImporting(false);
      // Reset file input
      event.target.value = '';
    }
  };

  const parseGoogleFormsCSV = (text: string) => {
    const parseRow = (line: string): string[] => {
      const fields: string[] = [];
      let inQuote = false;
      let current = '';
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuote && line[i + 1] === '"') { current += '"'; i++; }
          else { inQuote = !inQuote; }
        } else if (ch === ',' && !inQuote) {
          fields.push(current); current = '';
        } else { current += ch; }
      }
      fields.push(current);
      return fields;
    };
    const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
    if (lines.length < 2) return null;
    const allHeaders = parseRow(lines[0]);
    const questionHeaders = allHeaders.slice(2);
    const rows = lines.slice(1).map(line => {
      const cols = parseRow(line);
      return { timestamp: cols[0] || '', interviewerName: cols[1] || '', answers: questionHeaders.map((_, i) => cols[i + 2] || '') };
    }).filter(r => r.timestamp || r.interviewerName);
    return { headers: questionHeaders, rows };
  };

  const handleCsvFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsed = parseGoogleFormsCSV(text);
    if (!parsed || parsed.rows.length === 0) {
      toast({ title: "Erro", description: "Arquivo inválido ou vazio. Verifique se é um CSV exportado pelo Google Forms.", variant: "destructive" });
      return;
    }
    setCsvPreviewData(parsed);
    setCsvSurveyTitle(file.name.replace(/\.csv$/i, '').replace(/_/g, ' '));
    event.target.value = '';
  };

  const handleImportGoogleFormsCsv = async () => {
    if (!csvPreviewData || !csvSurveyTitle.trim()) return;
    setIsImportingCsv(true);
    try {
      const response = await fetch(`/api/organizations/${orgId}/surveys/import-google-forms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ surveyTitle: csvSurveyTitle, headers: csvPreviewData.headers, rows: csvPreviewData.rows }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Erro ao importar');
      }
      const result = await response.json();
      toast({ title: "Importado com sucesso!", description: `${result.responsesImported} respostas e ${result.questionsImported} perguntas importadas.` });
      setImportDialogOpen(false);
      setCsvPreviewData(null);
      setCsvSurveyTitle('');
      window.location.reload();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message || "Falha ao importar CSV", variant: "destructive" });
    } finally {
      setIsImportingCsv(false);
    }
  };

  const handleExportGoogleForms = async (surveyId: number, surveyTitle: string) => {
    setIsExporting(surveyId);
    try {
      const response = await fetch(`/api/surveys/${surveyId}/export?format=google-forms`, { credentials: 'include' });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Erro ao exportar');
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${surveyTitle.replace(/[^a-zA-Z0-9]/g, '_')}_GoogleForms.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast({ title: "Sucesso", description: "CSV no formato Google Forms exportado!" });
    } catch (error: any) {
      toast({ title: "Erro", description: error.message || "Falha ao exportar", variant: "destructive" });
    } finally {
      setIsExporting(null);
    }
  };

  if (orgLoading || surveysLoading || memberLoading) return <LoadingScreen message="Carregando pesquisas..." />;
  if (!org) return <div>Organizacao nao encontrada</div>;

  const handleCreateSurvey = async () => {
    if (!newSurvey.title.trim()) {
      toast({ title: "Erro", description: "O titulo da pesquisa e obrigatorio", variant: "destructive" });
      return;
    }
    try {
      const survey = await createSurvey.mutateAsync({
        orgId,
        data: {
          title: newSurvey.title,
          description: newSurvey.description || undefined,
          type: newSurvey.type,
          location: newSurvey.location || undefined,
          targetSample: newSurvey.targetSample || 400
        }
      });
      toast({ title: "Sucesso", description: "Pesquisa criada com sucesso!" });
      setIsCreateOpen(false);
      setNewSurvey({ title: "", description: "", type: "electoral", location: "", targetSample: 400 });
      setLocation(`/org/${orgId}/surveys/${survey.id}`);
    } catch (error) {
      toast({ title: "Erro", description: "Falha ao criar pesquisa", variant: "destructive" });
    }
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
      'draft': { label: 'Rascunho', variant: 'secondary' },
      'active': { label: 'Ativa', variant: 'default' },
      'paused': { label: 'Pausada', variant: 'outline' },
      'completed': { label: 'Concluída', variant: 'secondary' },
      'archived': { label: 'Arquivada', variant: 'outline' },
    };
    const c = config[status] || { label: status, variant: 'secondary' as const };
    return <Badge variant={c.variant}>{c.label}</Badge>;
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      'electoral': 'Eleitoral',
      'opinion': 'Opinião',
      'market': 'Mercado',
      'census': 'Censo'
    };
    return labels[type] || type;
  };

  const trashCount = trashedSurveys?.length || 0;

  const renderSurveyCard = (survey: Survey, isTrash: boolean = false) => (
    <Card key={survey.id} className="hover:shadow-md transition-shadow" data-testid={`card-survey-${survey.id}`}>
      <CardContent className="p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="flex items-start gap-3 sm:gap-4 flex-1 min-w-0">
            <div className={`p-2 sm:p-3 rounded-lg shrink-0 ${isTrash ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'}`}>
              <FileText className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h3 className="text-base sm:text-lg font-semibold truncate max-w-[200px] sm:max-w-none">{survey.title}</h3>
                {!isTrash && getStatusBadge(survey.status)}
                <Badge variant="outline" className="text-xs">{getTypeLabel(survey.type)}</Badge>
                {isTrash && <Badge variant="destructive" className="text-xs">Na Lixeira</Badge>}
              </div>
              {survey.description && (
                <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{survey.description}</p>
              )}
              <div className="flex items-center gap-2 sm:gap-4 text-xs text-muted-foreground flex-wrap">
                {survey.location && <span>{survey.location}</span>}
                <span>Amostra: {survey.targetSample || 0}</span>
                {isTrash && survey.deletedAt ? (
                  <span>Excluída: {new Date(survey.deletedAt).toLocaleDateString('pt-BR')}</span>
                ) : (
                  <span>Criada: {new Date(survey.createdAt!).toLocaleDateString('pt-BR')}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap sm:shrink-0 mt-2 sm:mt-0">
            {isTrash ? (
              <>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => handleRestore(survey)}
                  disabled={restoreSurvey.isPending}
                  data-testid={`button-restore-${survey.id}`}
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Restaurar
                </Button>
                <Button 
                  variant="destructive" 
                  size="sm" 
                  onClick={() => openDeleteConfirm(survey)}
                  data-testid={`button-delete-${survey.id}`}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Excluir
                </Button>
              </>
            ) : (
              <>
                {canSeeResults && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => {
                      const isViewerRole = userRole.toLowerCase() === 'viewer';
                      const resultsPath = isViewerRole 
                        ? `/org/${orgId}/surveys/${survey.id}/results`
                        : `/org/${orgId}/surveys/${survey.id}/analytics`;
                      setLocation(resultsPath);
                    }} 
                    data-testid={`button-analytics-${survey.id}`}
                  >
                    <BarChart3 className="w-4 h-4 mr-2" />
                    Resultados
                  </Button>
                )}
                {canEdit && (
                  <Button size="sm" onClick={() => setLocation(`/org/${orgId}/surveys/${survey.id}`)} data-testid={`button-edit-${survey.id}`}>
                    <Edit className="w-4 h-4 mr-2" />
                    Editar
                  </Button>
                )}
                {isInterviewer ? (
                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={() => setLocation(`/collect/${survey.id}`)} data-testid={`button-collect-${survey.id}`}>
                      <Play className="w-4 h-4 mr-2" />
                      Iniciar Coleta
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handlePrepareOffline(survey.id)}
                      disabled={preparingOffline.has(survey.id)}
                      title={offlineReadySurveys.has(survey.id) ? "Dados já baixados para offline" : "Baixar dados para uso offline"}
                      data-testid={`button-prepare-offline-${survey.id}`}
                    >
                      {preparingOffline.has(survey.id) ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : offlineReadySurveys.has(survey.id) ? (
                        <Check className="w-4 h-4 text-green-600" />
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                ) : (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" data-testid={`button-more-${survey.id}`}>
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {canEdit && survey.status === 'draft' && (
                        <DropdownMenuItem
                          onClick={async () => {
                            try {
                              await updateSurvey.mutateAsync({ id: survey.id, orgId, data: { status: 'completed' } });
                              toast({ title: "Sucesso", description: "Pesquisa marcada como concluída!" });
                            } catch {
                              toast({ title: "Erro", description: "Falha ao atualizar status", variant: "destructive" });
                            }
                          }}
                          data-testid={`button-mark-completed-${survey.id}`}
                        >
                          <CheckCircle2 className="w-4 h-4 mr-2" />
                          Marcar como Concluída
                        </DropdownMenuItem>
                      )}
                      {canEdit && (
                        <DropdownMenuItem onClick={() => handleOpenRename(survey)} data-testid={`button-rename-${survey.id}`}>
                          <Pencil className="w-4 h-4 mr-2" />
                          Renomear
                        </DropdownMenuItem>
                      )}
                      {canCreate && (
                        <DropdownMenuItem onClick={() => openDuplicateDialog(survey)} data-testid={`button-duplicate-${survey.id}`}>
                          <Copy className="w-4 h-4 mr-2" />
                          Duplicar
                        </DropdownMenuItem>
                      )}
                      {canImportExport && (
                        <>
                          <DropdownMenuItem 
                            onClick={() => handleExportTemplate(survey.id, survey.title)} 
                            disabled={isExporting === survey.id}
                            data-testid={`button-export-${survey.id}`}
                          >
                            <Download className="w-4 h-4 mr-2" />
                            {isExporting === survey.id ? "Exportando..." : "Exportar Template"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleExportGoogleForms(survey.id, survey.title)}
                            disabled={isExporting === survey.id}
                            data-testid={`button-export-gf-${survey.id}`}
                          >
                            <FileSpreadsheet className="w-4 h-4 mr-2" />
                            {isExporting === survey.id ? "Exportando..." : "Exportar (Google Forms)"}
                          </DropdownMenuItem>
                        </>
                      )}
                      {canAccessCollection && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => navigator.clipboard.writeText(`${window.location.origin}/collect/${survey.id}`)}>
                            <Copy className="w-4 h-4 mr-2" />
                            Copiar Link de Coleta
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => window.open(`/collect/${survey.id}`, '_blank')}>
                            <ExternalLink className="w-4 h-4 mr-2" />
                            Abrir Coleta
                          </DropdownMenuItem>
                        </>
                      )}
                      {canEdit && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            onClick={() => openTrashConfirm(survey)} 
                            className="text-destructive focus:text-destructive"
                            data-testid={`button-trash-${survey.id}`}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Mover para Lixeira
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <DashboardLayout orgId={params.orgId}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold">Pesquisas</h1>
            <p className="text-muted-foreground">
              {isInterviewer ? "Suas pesquisas designadas" : isViewer ? "Pesquisas atribuídas a você" : "Gerencie suas pesquisas e questionarios"}
            </p>
          </div>
          {canCreate && (
          <div className="flex items-center gap-2 flex-wrap">
            {canImportExport && (
              <Dialog open={importDialogOpen} onOpenChange={(open) => { setImportDialogOpen(open); if (!open) { setCsvPreviewData(null); setCsvSurveyTitle(''); setImportActiveTab('json'); } }}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="gap-2" data-testid="button-import-survey">
                    <Upload className="w-4 h-4" /> Importar
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Importar Pesquisa</DialogTitle>
                    <DialogDescription>
                      Escolha o formato do arquivo que deseja importar.
                    </DialogDescription>
                  </DialogHeader>
                  <Tabs value={importActiveTab} onValueChange={setImportActiveTab} className="w-full">
                    <TabsList className="w-full">
                      <TabsTrigger value="json" className="flex-1" data-testid="tab-import-json">JSON (Template)</TabsTrigger>
                      <TabsTrigger value="csv" className="flex-1" data-testid="tab-import-csv">CSV (Google Forms)</TabsTrigger>
                    </TabsList>

                    <TabsContent value="json">
                      <div className="space-y-4 py-4">
                        <div className="flex flex-col items-center justify-center border-2 border-dashed border-muted-foreground/25 rounded-lg p-8">
                          <Upload className="w-12 h-12 text-muted-foreground mb-4" />
                          <p className="text-sm text-muted-foreground mb-4 text-center">
                            Selecione um arquivo .json exportado do Data Veracity
                          </p>
                          <input
                            type="file"
                            accept=".json,application/json"
                            onChange={handleImportTemplate}
                            disabled={isImporting}
                            className="hidden"
                            id="import-file"
                            data-testid="input-import-file"
                          />
                          <label htmlFor="import-file">
                            <Button asChild disabled={isImporting}>
                              <span>{isImporting ? "Importando..." : "Selecionar Arquivo"}</span>
                            </Button>
                          </label>
                        </div>
                        <p className="text-xs text-muted-foreground text-center">
                          A pesquisa será criada como rascunho. Respostas coletadas não são importadas.
                        </p>
                      </div>
                    </TabsContent>

                    <TabsContent value="csv">
                      <div className="space-y-4 py-4">
                        {!csvPreviewData ? (
                          <div className="flex flex-col items-center justify-center border-2 border-dashed border-muted-foreground/25 rounded-lg p-8">
                            <FileSpreadsheet className="w-12 h-12 text-muted-foreground mb-4" />
                            <p className="text-sm text-muted-foreground mb-2 text-center font-medium">
                              CSV exportado pelo Google Forms
                            </p>
                            <p className="text-xs text-muted-foreground mb-4 text-center">
                              O arquivo deve ter "Carimbo de data/hora" e "Pesquisadora" como primeiras colunas
                            </p>
                            <input
                              type="file"
                              accept=".csv,text/csv"
                              onChange={handleCsvFileSelect}
                              className="hidden"
                              id="import-csv-file"
                              data-testid="input-import-csv-file"
                            />
                            <label htmlFor="import-csv-file">
                              <Button asChild variant="outline">
                                <span>Selecionar CSV</span>
                              </Button>
                            </label>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            <div className="rounded-lg border bg-muted/40 p-4 space-y-2">
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">Respostas detectadas</span>
                                <span className="font-semibold">{csvPreviewData.rows.length}</span>
                              </div>
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">Perguntas detectadas</span>
                                <span className="font-semibold">{csvPreviewData.headers.length}</span>
                              </div>
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">Pesquisadoras</span>
                                <span className="font-semibold">
                                  {[...new Set(csvPreviewData.rows.map(r => r.interviewerName).filter(Boolean))].join(', ') || '—'}
                                </span>
                              </div>
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor="csv-survey-title">Nome da pesquisa</Label>
                              <Input
                                id="csv-survey-title"
                                value={csvSurveyTitle}
                                onChange={(e) => setCsvSurveyTitle(e.target.value)}
                                placeholder="Ex: Pesquisa Geninho Maio 2026"
                                data-testid="input-csv-survey-title"
                              />
                            </div>
                            <p className="text-xs text-muted-foreground">
                              As respostas serão importadas sem GPS nem áudio. Aparecerão na auditoria com badge "Importado".
                            </p>
                            <div className="flex gap-2">
                              <Button variant="outline" className="flex-1" onClick={() => setCsvPreviewData(null)} data-testid="button-csv-back">
                                Trocar Arquivo
                              </Button>
                              <Button
                                className="flex-1"
                                onClick={handleImportGoogleFormsCsv}
                                disabled={isImportingCsv || !csvSurveyTitle.trim()}
                                data-testid="button-csv-confirm"
                              >
                                {isImportingCsv ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Importando...</> : "Importar Respostas"}
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </TabsContent>
                  </Tabs>
                </DialogContent>
              </Dialog>
            )}
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2" data-testid="button-new-survey">
                  <Plus className="w-4 h-4" /> Nova Pesquisa
                </Button>
              </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Criar Nova Pesquisa</DialogTitle>
                <DialogDescription>Preencha os dados basicos para criar sua pesquisa</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Titulo *</Label>
                  <Input
                    id="title"
                    placeholder="Ex: Pesquisa Eleitoral Municipio X"
                    value={newSurvey.title}
                    onChange={(e) => setNewSurvey({ ...newSurvey, title: e.target.value })}
                    data-testid="input-survey-title"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Descricao</Label>
                  <Textarea
                    id="description"
                    placeholder="Descreva o objetivo da pesquisa..."
                    value={newSurvey.description}
                    onChange={(e) => setNewSurvey({ ...newSurvey, description: e.target.value })}
                    data-testid="input-survey-description"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="type">Tipo</Label>
                    <Select value={newSurvey.type} onValueChange={(v) => setNewSurvey({ ...newSurvey, type: v })}>
                      <SelectTrigger data-testid="select-survey-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="electoral">Eleitoral</SelectItem>
                        <SelectItem value="opinion">Opinião</SelectItem>
                        <SelectItem value="market">Mercado</SelectItem>
                        <SelectItem value="census">Censo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sample">Amostra Alvo</Label>
                    <Input
                      id="sample"
                      type="number"
                      value={newSurvey.targetSample}
                      onChange={(e) => setNewSurvey({ ...newSurvey, targetSample: parseInt(e.target.value) || 400 })}
                      data-testid="input-survey-sample"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="location">Localizacao</Label>
                  <Input
                    id="location"
                    placeholder="Ex: Sao Paulo, SP"
                    value={newSurvey.location}
                    onChange={(e) => setNewSurvey({ ...newSurvey, location: e.target.value })}
                    data-testid="input-survey-location"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancelar</Button>
                <Button onClick={handleCreateSurvey} disabled={createSurvey.isPending} data-testid="button-create-survey">
                  {createSurvey.isPending ? "Criando..." : "Criar Pesquisa"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </div>
          )}
        </div>

        {canEdit && (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList>
              <TabsTrigger value="active" data-testid="tab-active-surveys">
                <FileText className="w-4 h-4 mr-2" />
                Pesquisas Ativas
              </TabsTrigger>
              <TabsTrigger value="trash" data-testid="tab-trash-surveys">
                <Trash2 className="w-4 h-4 mr-2" />
                Lixeira {trashCount > 0 && <Badge variant="secondary" className="ml-2">{trashCount}</Badge>}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="active" className="mt-4">
              {surveys && surveys.length > 0 ? (
                <div className="grid gap-4">
                  {surveys.map((survey) => renderSurveyCard(survey, false))}
                </div>
              ) : (
                <Card className="border-dashed">
                  <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                      <FileText className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">
                      {isInterviewer || isViewer ? "Nenhuma pesquisa atribuída" : "Nenhuma pesquisa ainda"}
                    </h3>
                    <p className="text-muted-foreground mb-6 max-w-sm">
                      {isInterviewer 
                        ? "Voce ainda nao foi designado para nenhuma pesquisa. Aguarde ser adicionado a uma pesquisa pelo coordenador."
                        : isViewer 
                          ? "Você ainda não foi atribuído a nenhuma pesquisa. Aguarde um administrador atribuir pesquisas a você."
                          : "Crie sua primeira pesquisa para comecar a coletar dados com seguranca e auditoria."
                      }
                    </p>
                    {canCreate && (
                      <Button onClick={() => setIsCreateOpen(true)} className="gap-2" data-testid="button-create-first-survey">
                        <Plus className="w-4 h-4" /> Criar Primeira Pesquisa
                      </Button>
                    )}
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="trash" className="mt-4">
              {trashLoading ? (
                <LoadingScreen message="Carregando lixeira..." />
              ) : trashedSurveys && trashedSurveys.length > 0 ? (
                <div className="grid gap-4">
                  {trashedSurveys.map((survey: Survey) => renderSurveyCard(survey, true))}
                </div>
              ) : (
                <Card className="border-dashed">
                  <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                      <Trash2 className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">Lixeira vazia</h3>
                    <p className="text-muted-foreground max-w-sm">
                      Pesquisas excluídas aparecerão aqui. Você pode restaurá-las ou excluí-las permanentemente.
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        )}

        {!canEdit && surveys && surveys.length > 0 && (
          <div className="grid gap-4">
            {surveys.map((survey) => renderSurveyCard(survey, false))}
          </div>
        )}

        {!canEdit && (!surveys || surveys.length === 0) && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <FileText className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">
                {isInterviewer || isViewer ? "Nenhuma pesquisa atribuída" : "Nenhuma pesquisa ainda"}
              </h3>
              <p className="text-muted-foreground mb-6 max-w-sm">
                {isInterviewer 
                  ? "Voce ainda nao foi designado para nenhuma pesquisa. Aguarde ser adicionado a uma pesquisa pelo coordenador."
                  : isViewer 
                    ? "Você ainda não foi atribuído a nenhuma pesquisa. Aguarde um administrador atribuir pesquisas a você."
                    : "Crie sua primeira pesquisa para comecar a coletar dados com seguranca e auditoria."
                }
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Rename Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Renomear Pesquisa</DialogTitle>
            <DialogDescription>
              Digite o novo nome para a pesquisa
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="rename-title">Novo Título</Label>
              <Input
                id="rename-title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Nome da pesquisa"
                data-testid="input-rename-title"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleRename();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleRename} 
              disabled={updateSurvey.isPending || !newTitle.trim()}
              data-testid="button-confirm-rename"
            >
              {updateSurvey.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate Dialog */}
      <Dialog open={duplicateDialogOpen} onOpenChange={setDuplicateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Duplicar Pesquisa</DialogTitle>
            <DialogDescription>
              Uma cópia da pesquisa será criada com todas as perguntas
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="duplicate-title">Título da Nova Pesquisa</Label>
              <Input
                id="duplicate-title"
                value={duplicateTitle}
                onChange={(e) => setDuplicateTitle(e.target.value)}
                placeholder="Nome da pesquisa"
                data-testid="input-duplicate-title"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDuplicateDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleDuplicate} 
              disabled={duplicateSurvey.isPending}
              data-testid="button-confirm-duplicate"
            >
              {duplicateSurvey.isPending ? "Duplicando..." : "Duplicar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Trash Confirmation */}
      <AlertDialog open={trashConfirmOpen} onOpenChange={setTrashConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mover para Lixeira?</AlertDialogTitle>
            <AlertDialogDescription>
              A pesquisa "{surveyToAction?.title}" será movida para a lixeira. 
              Você poderá restaurá-la depois ou excluí-la permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleTrash}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-trash"
            >
              {trashSurvey.isPending ? "Movendo..." : "Mover para Lixeira"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Permanent Delete Confirmation */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Permanentemente?</AlertDialogTitle>
            <AlertDialogDescription>
              A pesquisa "{surveyToAction?.title}" será excluída permanentemente junto com todas as suas 
              perguntas, respostas e dados relacionados. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handlePermanentDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteSurvey.isPending ? "Excluindo..." : "Excluir Permanentemente"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
