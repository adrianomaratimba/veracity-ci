import { useOrganization } from "@/hooks/use-organizations";
import { useSurvey, useUpdateSurvey, useCreateSurvey } from "@/hooks/use-surveys";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import { ArrowLeft, Save, Plus, GripVertical, Trash2, Play, Pause, ExternalLink, Copy, Settings2, FileText, CheckCircle, Users, UserPlus, UserMinus, Layers, Image, X, Loader2, Target, AlertTriangle, GitBranch, ChevronUp, ChevronDown, Eye } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import type { SurveyQuotas, QuotaGroup, QuotaTarget, QuestionLogic, SkipLogicRule } from "@shared/schema";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { QuestionModule } from "@shared/schema";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { buildUrl, api } from "@shared/routes";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { apiRequest } from "@/lib/queryClient";
import { useUpload } from "@/hooks/use-upload";

interface QuestionOption {
  text: string;
  imageUrl?: string;
}

interface QuestionForm {
  id?: number;
  text: string;
  type: string;
  options: QuestionOption[];
  required: boolean;
  order: number;
  shuffleOptions?: boolean;
  showOptionImages?: boolean;
  logic?: QuestionLogic;
}

function normalizeOption(opt: string | QuestionOption): QuestionOption {
  if (typeof opt === 'string') {
    return { text: opt };
  }
  return opt;
}

function normalizeOptions(opts: any): QuestionOption[] {
  if (!Array.isArray(opts)) return [];
  return opts.map(normalizeOption);
}

interface OptionEditorProps {
  option: QuestionOption;
  optIndex: number;
  questionIndex: number;
  canDelete: boolean;
  showImages?: boolean;
  onUpdate: (opt: QuestionOption) => void;
  onDelete: () => void;
}

function OptionEditor({ option, optIndex, questionIndex, canDelete, showImages, onUpdate, onDelete }: OptionEditorProps) {
  const { uploadFile, isUploading } = useUpload();

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const result = await uploadFile(file);
    if (result) {
      onUpdate({ ...option, imageUrl: result.objectPath });
    }
  };

  const handleRemoveImage = () => {
    onUpdate({ ...option, imageUrl: undefined });
  };

  return (
    <div className="flex items-center gap-2">
      <Input
        value={option.text}
        onChange={(e) => onUpdate({ ...option, text: e.target.value })}
        placeholder={`Opcao ${optIndex + 1}`}
        className="flex-1"
        data-testid={`input-option-${questionIndex}-${optIndex}`}
      />
      
      {showImages && (
        <>
          {option.imageUrl ? (
            <div className="relative group">
              <img 
                src={option.imageUrl} 
                alt={option.text} 
                className="w-10 h-10 object-cover rounded-md border"
              />
              <Button
                variant="destructive"
                size="icon"
                className="absolute -top-2 -right-2 w-5 h-5"
                onClick={handleRemoveImage}
                data-testid={`button-remove-image-${questionIndex}-${optIndex}`}
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          ) : (
            <>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
                id={`image-${questionIndex}-${optIndex}`}
                data-testid={`input-image-${questionIndex}-${optIndex}`}
              />
              <Button
                variant="outline"
                size="icon"
                disabled={isUploading}
                onClick={() => document.getElementById(`image-${questionIndex}-${optIndex}`)?.click()}
                data-testid={`button-add-image-${questionIndex}-${optIndex}`}
              >
                {isUploading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Image className="w-4 h-4" />
                )}
              </Button>
            </>
          )}
        </>
      )}
      
      <Button
        variant="ghost"
        size="icon"
        onClick={onDelete}
        disabled={!canDelete}
        data-testid={`button-delete-option-${questionIndex}-${optIndex}`}
      >
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );
}

interface SkipLogicEditorProps {
  question: QuestionForm;
  questionIndex: number;
  allQuestions: QuestionForm[];
  onUpdate: (logic: QuestionLogic) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function SkipLogicEditor({ question, questionIndex, allQuestions, onUpdate, open, onOpenChange }: SkipLogicEditorProps) {
  const [rules, setRules] = useState<SkipLogicRule[]>(question.logic?.rules || []);

  useEffect(() => {
    setRules(question.logic?.rules || []);
  }, [question.logic, open]);

  const generateId = () => Math.random().toString(36).substring(2, 9);

  const addRule = () => {
    const newRule: SkipLogicRule = {
      id: generateId(),
      condition: {
        operator: 'equals',
        value: '',
      },
      action: {
        type: 'skip_to_question',
        targetQuestionId: undefined,
      },
    };
    setRules([...rules, newRule]);
  };

  const updateRule = (ruleId: string, updates: Partial<SkipLogicRule>) => {
    setRules(rules.map(r => r.id === ruleId ? { ...r, ...updates } : r));
  };

  const updateRuleCondition = (ruleId: string, updates: Partial<SkipLogicRule['condition']>) => {
    setRules(rules.map(r => r.id === ruleId ? { ...r, condition: { ...r.condition, ...updates } } : r));
  };

  const updateRuleAction = (ruleId: string, updates: Partial<SkipLogicRule['action']>) => {
    setRules(rules.map(r => r.id === ruleId ? { ...r, action: { ...r.action, ...updates } } : r));
  };

  const deleteRule = (ruleId: string) => {
    setRules(rules.filter(r => r.id !== ruleId));
  };

  const handleSave = () => {
    onUpdate({ rules });
    onOpenChange(false);
  };

  const futureQuestions = allQuestions.filter((q, idx) => idx > questionIndex);
  const hasOptions = question.type === 'single_choice' || question.type === 'multiple_choice';

  const operatorLabels: Record<string, string> = {
    'equals': 'for igual a',
    'not_equals': 'for diferente de',
    'contains': 'contiver',
    'any': 'for qualquer valor',
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="w-5 h-5" />
            Logica de Pulo
          </DialogTitle>
          <DialogDescription>
            Configure regras para pular perguntas baseado nas respostas. Pergunta: "{question.text.substring(0, 50)}..."
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {rules.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <GitBranch className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Nenhuma regra de pulo configurada.</p>
              <p className="text-sm">Adicione regras para controlar o fluxo da pesquisa.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {rules.map((rule, ruleIndex) => (
                <Card key={rule.id} className="p-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Regra {ruleIndex + 1}</span>
                      <Button variant="ghost" size="icon" onClick={() => deleteRule(rule.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>

                    <div className="grid gap-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm">Se a resposta</span>
                        <Select
                          value={rule.condition.operator}
                          onValueChange={(v) => updateRuleCondition(rule.id, { operator: v as any })}
                        >
                          <SelectTrigger className="w-40" data-testid={`select-operator-${ruleIndex}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="equals">for igual a</SelectItem>
                            <SelectItem value="not_equals">for diferente de</SelectItem>
                            {question.type === 'multiple_choice' && (
                              <SelectItem value="contains">contiver</SelectItem>
                            )}
                            <SelectItem value="any">for qualquer valor</SelectItem>
                          </SelectContent>
                        </Select>

                        {rule.condition.operator !== 'any' && hasOptions && (
                          <Select
                            value={typeof rule.condition.value === 'string' ? rule.condition.value : ''}
                            onValueChange={(v) => updateRuleCondition(rule.id, { value: v })}
                          >
                            <SelectTrigger className="w-48" data-testid={`select-value-${ruleIndex}`}>
                              <SelectValue placeholder="Selecione opcao" />
                            </SelectTrigger>
                            <SelectContent>
                              {question.options.map((opt, optIdx) => (
                                <SelectItem key={optIdx} value={opt.text}>
                                  {opt.text}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}

                        {rule.condition.operator !== 'any' && !hasOptions && (
                          <Input
                            value={typeof rule.condition.value === 'string' ? rule.condition.value : ''}
                            onChange={(e) => updateRuleCondition(rule.id, { value: e.target.value })}
                            placeholder="Valor"
                            className="w-40"
                            data-testid={`input-value-${ruleIndex}`}
                          />
                        )}
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm">Entao</span>
                        <Select
                          value={rule.action.type}
                          onValueChange={(v) => updateRuleAction(rule.id, { type: v as any, targetQuestionId: undefined })}
                        >
                          <SelectTrigger className="w-48" data-testid={`select-action-${ruleIndex}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="skip_to_question">Pular para pergunta</SelectItem>
                            <SelectItem value="skip_to_end">Finalizar pesquisa</SelectItem>
                          </SelectContent>
                        </Select>

                        {rule.action.type === 'skip_to_question' && (
                          <Select
                            value={rule.action.targetQuestionId?.toString() || ''}
                            onValueChange={(v) => updateRuleAction(rule.id, { targetQuestionId: parseInt(v) })}
                          >
                            <SelectTrigger className="w-64" data-testid={`select-target-${ruleIndex}`}>
                              <SelectValue placeholder="Selecione pergunta" />
                            </SelectTrigger>
                            <SelectContent>
                              {futureQuestions.map((q) => (
                                <SelectItem key={q.id || q.order} value={(q.id || q.order).toString()}>
                                  {q.order + 1}. {q.text.substring(0, 40)}...
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          <Button variant="outline" onClick={addRule} className="w-full" data-testid="button-add-rule">
            <Plus className="w-4 h-4 mr-2" /> Adicionar Regra
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} data-testid="button-save-logic">Salvar Logica</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SurveyEditorPage({ params }: { params: { orgId: string; id?: string } }) {
  const orgId = parseInt(params.orgId);
  const parsedId = params.id ? parseInt(params.id) : NaN;
  const isNewSurvey = !params.id || params.id === "new" || isNaN(parsedId);
  const surveyId = isNewSurvey ? 0 : parsedId;
  const { data: org, isLoading: orgLoading } = useOrganization(orgId);
  const surveyQuery = useSurvey(surveyId);
  const survey = isNewSurvey ? null : surveyQuery.data;
  const surveyLoading = isNewSurvey ? false : surveyQuery.isLoading;
  const refetch = surveyQuery.refetch;
  const updateSurvey = useUpdateSurvey();
  const createSurvey = useCreateSurvey();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Interviewer assignments - only fetch if not new survey
  const { data: assignments = [], isLoading: assignmentsLoading } = useQuery<any[]>({
    queryKey: [`/api/surveys/${surveyId}/assignments`],
    enabled: !isNewSurvey && surveyId > 0,
  });

  const { data: availableInterviewers = [], isLoading: interviewersLoading } = useQuery<any[]>({
    queryKey: [`/api/organizations/${orgId}/interviewers`],
    enabled: !isNewSurvey && surveyId > 0,
  });

  const assignInterviewer = useMutation({
    mutationFn: async (interviewerId: string) => {
      const res = await apiRequest('POST', `/api/surveys/${surveyId}/assignments`, { interviewerId });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Erro ao designar entrevistador');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/surveys/${surveyId}/assignments`] });
      toast({ title: "Entrevistador designado" });
    },
    onError: (err: Error) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  });

  const unassignInterviewer = useMutation({
    mutationFn: async (interviewerId: string) => {
      const res = await apiRequest('DELETE', `/api/surveys/${surveyId}/assignments/${interviewerId}`);
      if (!res.ok) throw new Error('Erro ao remover designação');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/surveys/${surveyId}/assignments`] });
      toast({ title: "Designação removida" });
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao remover designação", variant: "destructive" });
    }
  });

  // Coordinator assignments - only fetch if not new survey
  const { data: coordinatorAssignments = [], isLoading: coordinatorAssignmentsLoading } = useQuery<any[]>({
    queryKey: [`/api/surveys/${surveyId}/coordinators`],
    enabled: !isNewSurvey && surveyId > 0,
  });

  const { data: availableCoordinators = [], isLoading: coordinatorsLoading } = useQuery<any[]>({
    queryKey: [`/api/organizations/${orgId}/coordinators`],
    enabled: !isNewSurvey && surveyId > 0,
  });

  const assignCoordinator = useMutation({
    mutationFn: async (coordinatorId: string) => {
      const res = await apiRequest('POST', `/api/surveys/${surveyId}/coordinators`, { coordinatorId });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Erro ao designar coordenador');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/surveys/${surveyId}/coordinators`] });
      toast({ title: "Coordenador designado" });
    },
    onError: (err: Error) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  });

  const unassignCoordinator = useMutation({
    mutationFn: async (coordinatorId: string) => {
      const res = await apiRequest('DELETE', `/api/surveys/${surveyId}/coordinators/${coordinatorId}`);
      if (!res.ok) throw new Error('Erro ao remover designação');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/surveys/${surveyId}/coordinators`] });
      toast({ title: "Coordenador removido" });
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao remover coordenador", variant: "destructive" });
    }
  });

  // Viewer assignments - only fetch if not new survey
  const { data: viewerAssignments = [], isLoading: viewerAssignmentsLoading } = useQuery<any[]>({
    queryKey: [`/api/surveys/${surveyId}/viewers`],
    enabled: !isNewSurvey && surveyId > 0,
  });

  const { data: availableViewers = [], isLoading: viewersLoading } = useQuery<any[]>({
    queryKey: [`/api/organizations/${orgId}/viewers`],
    enabled: !isNewSurvey && surveyId > 0,
  });

  const assignViewer = useMutation({
    mutationFn: async (viewerId: string) => {
      const res = await apiRequest('POST', `/api/surveys/${surveyId}/viewers`, { viewerId });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Erro ao designar visualizador');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/surveys/${surveyId}/viewers`] });
      queryClient.invalidateQueries({ queryKey: [`/api/organizations/${orgId}/viewers`] });
      toast({ title: "Visualizador designado" });
    },
    onError: (err: Error) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  });

  const unassignViewer = useMutation({
    mutationFn: async (viewerId: string) => {
      const res = await apiRequest('DELETE', `/api/surveys/${surveyId}/viewers/${viewerId}`);
      if (!res.ok) throw new Error('Erro ao remover designação');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/surveys/${surveyId}/viewers`] });
      queryClient.invalidateQueries({ queryKey: [`/api/organizations/${orgId}/viewers`] });
      toast({ title: "Visualizador removido" });
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao remover visualizador", variant: "destructive" });
    }
  });

  // Viewer settings - configures what viewers can see
  const { data: viewerSettings, isLoading: viewerSettingsLoading } = useQuery<any>({
    queryKey: [`/api/surveys/${surveyId}/viewer-settings`],
    enabled: !isNewSurvey && surveyId > 0,
  });

  const [viewerSettingsForm, setViewerSettingsForm] = useState({
    showFilters: false,
    filterAgeGroup: false,
    filterGender: false,
    filterNeighborhood: false,
    filterInterviewer: false,
    showIntentionTab: true,
    showEvolutionTab: false,
    showCrossingsTab: false,
    showProfileTab: false,
    showReportTab: false,
    showMainResult: true,
    showDemographicBreakdowns: false,
    showGenderBreakdown: false,
    showAgeBreakdown: false,
    showNeighborhoodBreakdown: false,
    showInterviewerStats: false,
    allowExcelExport: false,
    allowPdfExport: false,
  });

  useEffect(() => {
    if (viewerSettings) {
      setViewerSettingsForm({
        showFilters: viewerSettings.showFilters ?? false,
        filterAgeGroup: viewerSettings.filterAgeGroup ?? false,
        filterGender: viewerSettings.filterGender ?? false,
        filterNeighborhood: viewerSettings.filterNeighborhood ?? false,
        filterInterviewer: viewerSettings.filterInterviewer ?? false,
        showIntentionTab: viewerSettings.showIntentionTab ?? true,
        showEvolutionTab: viewerSettings.showEvolutionTab ?? false,
        showCrossingsTab: viewerSettings.showCrossingsTab ?? false,
        showProfileTab: viewerSettings.showProfileTab ?? false,
        showReportTab: viewerSettings.showReportTab ?? false,
        showMainResult: viewerSettings.showMainResult ?? true,
        showDemographicBreakdowns: viewerSettings.showDemographicBreakdowns ?? false,
        showGenderBreakdown: viewerSettings.showGenderBreakdown ?? false,
        showAgeBreakdown: viewerSettings.showAgeBreakdown ?? false,
        showNeighborhoodBreakdown: viewerSettings.showNeighborhoodBreakdown ?? false,
        showInterviewerStats: viewerSettings.showInterviewerStats ?? false,
        allowExcelExport: viewerSettings.allowExcelExport ?? false,
        allowPdfExport: viewerSettings.allowPdfExport ?? false,
      });
    }
  }, [viewerSettings]);

  const saveViewerSettings = useMutation({
    mutationFn: async (data: typeof viewerSettingsForm) => {
      const res = await apiRequest('PUT', `/api/surveys/${surveyId}/viewer-settings`, data);
      if (!res.ok) throw new Error('Erro ao salvar configurações');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/surveys/${surveyId}/viewer-settings`] });
      toast({ title: "Configurações salvas", description: "As configurações de visualização foram atualizadas." });
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao salvar configurações", variant: "destructive" });
    }
  });

  const [surveyForm, setSurveyForm] = useState({
    title: "",
    description: "",
    type: "electoral",
    location: "",
    targetSample: 400,
    marginOfError: null as number | null,
    startDate: "",
    endDate: "",
    status: "draft",
    shuffleQuestions: false,
    requireGps: true,
    requireAudio: true
  });

  const [questions, setQuestions] = useState<QuestionForm[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [modulesDialogOpen, setModulesDialogOpen] = useState(false);
  const [skipLogicQuestionIndex, setSkipLogicQuestionIndex] = useState<number | null>(null);
  
  const [quotas, setQuotas] = useState<SurveyQuotas>({
    enabled: false,
    groups: []
  });

  // Question modules query
  const { data: questionModules = [] } = useQuery<QuestionModule[]>({
    queryKey: ['/api/organizations', orgId, 'question-modules'],
    enabled: !isNewSurvey,
  });

  useEffect(() => {
    if (survey) {
      setSurveyForm({
        title: survey.title || "",
        description: survey.description || "",
        type: survey.type || "electoral",
        location: survey.location || "",
        targetSample: survey.targetSample || 400,
        marginOfError: survey.marginOfError || null,
        startDate: survey.startDate ? new Date(survey.startDate).toISOString().split('T')[0] : "",
        endDate: survey.endDate ? new Date(survey.endDate).toISOString().split('T')[0] : "",
        status: survey.status || "draft",
        shuffleQuestions: (survey as any).shuffleQuestions ?? false,
        requireGps: (survey as any).requireGps ?? true,
        requireAudio: (survey as any).requireAudio ?? true
      });
      if (survey.questions) {
        setQuestions(survey.questions.map(q => ({
          id: q.id,
          text: q.text,
          type: q.type,
          options: normalizeOptions(q.options),
          required: q.required ?? true,
          order: q.order,
          shuffleOptions: (q as any).shuffleOptions ?? false,
          logic: (q as any).logic ?? { rules: [] }
        })));
      }
      if (survey.quotas) {
        setQuotas(survey.quotas as SurveyQuotas);
      }
    }
  }, [survey]);

  const createQuestion = useMutation({
    mutationFn: async (data: { text: string; type: string; options?: QuestionOption[] | string[]; required: boolean; order: number; shuffleOptions?: boolean; showOptionImages?: boolean; logic?: QuestionLogic }) => {
      const url = buildUrl(api.questions.create.path, { surveyId });
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create question");
      return res.json();
    },
    onSuccess: () => refetch(),
  });

  const updateQuestion = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<QuestionForm> }) => {
      const url = buildUrl(api.questions.update.path, { id });
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update question");
      return res.json();
    },
    onSuccess: () => refetch(),
  });

  const deleteQuestion = useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.questions.delete.path, { id });
      const res = await fetch(url, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete question");
    },
    onSuccess: () => refetch(),
  });

  if (orgLoading || (!isNewSurvey && surveyLoading)) return <LoadingScreen message="Carregando pesquisa..." />;
  if (!org) return <div>Organizacao nao encontrada</div>;
  if (!isNewSurvey && !survey) return <div>Pesquisa nao encontrada</div>;

  const handleSaveSurvey = async () => {
    if (!surveyForm.title.trim()) {
      toast({ title: "Erro", description: "O titulo da pesquisa e obrigatorio", variant: "destructive" });
      return;
    }
    try {
      if (isNewSurvey) {
        const newSurvey = await createSurvey.mutateAsync({
          orgId,
          data: {
            title: surveyForm.title,
            description: surveyForm.description || undefined,
            type: surveyForm.type,
            location: surveyForm.location || undefined,
            targetSample: surveyForm.targetSample,
            marginOfError: surveyForm.marginOfError ?? undefined,
            startDate: surveyForm.startDate ? new Date(surveyForm.startDate) : null,
            endDate: surveyForm.endDate ? new Date(surveyForm.endDate) : null,
            shuffleQuestions: surveyForm.shuffleQuestions,
            requireGps: surveyForm.requireGps,
            requireAudio: surveyForm.requireAudio
          }
        });
        toast({ title: "Criada", description: "Pesquisa criada com sucesso!" });
        setLocation(`/org/${orgId}/surveys/${newSurvey.id}`);
      } else {
        await updateSurvey.mutateAsync({
          id: surveyId,
          orgId,
          data: {
            title: surveyForm.title,
            description: surveyForm.description || undefined,
            type: surveyForm.type,
            location: surveyForm.location || undefined,
            targetSample: surveyForm.targetSample,
            marginOfError: surveyForm.marginOfError ?? undefined,
            startDate: surveyForm.startDate ? new Date(surveyForm.startDate) : null,
            endDate: surveyForm.endDate ? new Date(surveyForm.endDate) : null,
            status: surveyForm.status,
            quotas: quotas,
            shuffleQuestions: surveyForm.shuffleQuestions,
            requireGps: surveyForm.requireGps,
            requireAudio: surveyForm.requireAudio
          }
        });
        
        // Also save all questions (including logic) when saving the survey
        for (let i = 0; i < questions.length; i++) {
          const q = questions[i];
          const newOrder = i + 1; // Order is 1-indexed based on current position
          if (q.id) {
            // Update existing question with all fields including order and logic
            await updateQuestion.mutateAsync({ 
              id: q.id, 
              data: { 
                text: q.text, 
                type: q.type, 
                options: q.options, 
                required: q.required, 
                order: newOrder,
                shuffleOptions: q.shuffleOptions, 
                showOptionImages: q.showOptionImages,
                logic: q.logic 
              } 
            });
          } else if (q.text.trim()) {
            // Create new question
            await createQuestion.mutateAsync({
              text: q.text,
              type: q.type,
              options: q.options,
              required: q.required,
              order: newOrder,
              shuffleOptions: q.shuffleOptions,
              showOptionImages: q.showOptionImages,
              logic: q.logic
            });
          }
        }
        
        toast({ title: "Salvo", description: "Pesquisa e perguntas atualizadas com sucesso!" });
      }
      setHasChanges(false);
    } catch (error) {
      toast({ title: "Erro", description: "Falha ao salvar pesquisa", variant: "destructive" });
    }
  };

  const handleAddQuestion = () => {
    const newQuestion: QuestionForm = {
      text: "",
      type: "single_choice",
      options: [{ text: "Opção 1" }, { text: "Opção 2" }],
      required: true,
      order: questions.length + 1
    };
    setQuestions([...questions, newQuestion]);
    setHasChanges(true);
  };

  const handleImportModule = async (module: QuestionModule) => {
    const moduleQuestions = (module.questions as any[]) || [];
    if (moduleQuestions.length === 0) {
      toast({ title: "Modulo vazio", description: "Este modulo nao tem perguntas", variant: "destructive" });
      return;
    }
    
    setModulesDialogOpen(false);
    
    try {
      // Create all questions directly via API
      for (let idx = 0; idx < moduleQuestions.length; idx++) {
        const q = moduleQuestions[idx];
        await createQuestion.mutateAsync({
          text: q.text,
          type: q.type === "multiple_choice" ? "single_choice" : q.type,
          options: q.options || [],
          required: q.required ?? true,
          order: questions.length + idx + 1
        });
      }
      
      toast({ 
        title: "Modulo importado", 
        description: `${moduleQuestions.length} perguntas criadas do modulo "${module.name}"` 
      });
    } catch (error) {
      toast({ title: "Erro", description: "Falha ao importar perguntas do modulo", variant: "destructive" });
    }
  };

  const handleSaveQuestion = async (index: number) => {
    const q = questions[index];
    const newOrder = index + 1; // Order is 1-indexed
    try {
      if (q.id) {
        await updateQuestion.mutateAsync({ id: q.id, data: { text: q.text, type: q.type, options: q.options, required: q.required, order: newOrder, shuffleOptions: q.shuffleOptions, showOptionImages: q.showOptionImages, logic: q.logic } });
      } else {
        await createQuestion.mutateAsync({ text: q.text, type: q.type, options: q.options, required: q.required, order: newOrder, shuffleOptions: q.shuffleOptions, showOptionImages: q.showOptionImages, logic: q.logic });
      }
      toast({ title: "Salvo", description: "Pergunta salva com sucesso!" });
    } catch (error) {
      toast({ title: "Erro", description: "Falha ao salvar pergunta", variant: "destructive" });
    }
  };
  
  const handleUpdateLogic = (index: number, logic: QuestionLogic) => {
    updateQuestionField(index, "logic", logic);
  };

  const handleDeleteQuestion = async (index: number) => {
    const q = questions[index];
    if (q.id) {
      try {
        await deleteQuestion.mutateAsync(q.id);
        toast({ title: "Removida", description: "Pergunta removida" });
      } catch (error) {
        toast({ title: "Erro", description: "Falha ao remover pergunta", variant: "destructive" });
      }
    } else {
      setQuestions(questions.filter((_, i) => i !== index));
    }
  };

  const updateQuestionField = (index: number, field: keyof QuestionForm, value: any) => {
    const updated = [...questions];
    updated[index] = { ...updated[index], [field]: value };
    setQuestions(updated);
    setHasChanges(true);
  };

  const moveQuestion = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= questions.length) return;
    
    const updated = [...questions];
    const temp = updated[index];
    updated[index] = updated[newIndex];
    updated[newIndex] = temp;
    
    // Update order property for both questions
    updated[index] = { ...updated[index], order: index };
    updated[newIndex] = { ...updated[newIndex], order: newIndex };
    
    setQuestions(updated);
    setHasChanges(true);
  };

  const questionTypes = [
    { value: "single_choice", label: "Escolha Única" },
    { value: "multiple_choice", label: "Múltipla Escolha" },
    { value: "text", label: "Texto Livre" },
    { value: "number", label: "Número" },
    { value: "scale", label: "Escala (1-10)" },
    { value: "boolean", label: "Sim/Não" },
  ];

  return (
    <DashboardLayout orgId={params.orgId}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => setLocation(`/org/${orgId}/surveys`)} data-testid="button-back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-display font-bold">{surveyForm.title || "Nova Pesquisa"}</h1>
                <Badge variant={surveyForm.status === 'active' ? 'default' : 'secondary'}>
                  {surveyForm.status === 'active' ? 'Ativa' : surveyForm.status === 'draft' ? 'Rascunho' : surveyForm.status === 'paused' ? 'Pausada' : 'Concluída'}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">Edite os detalhes e perguntas da pesquisa</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isNewSurvey && (
              <Button variant="outline" onClick={() => navigator.clipboard.writeText(`${window.location.origin}/collect/${surveyId}`)} data-testid="button-copy-link">
                <Copy className="w-4 h-4 mr-2" /> Copiar Link
              </Button>
            )}
            <Button onClick={handleSaveSurvey} disabled={updateSurvey.isPending || createSurvey.isPending} data-testid="button-save-survey">
              <Save className="w-4 h-4 mr-2" /> {(updateSurvey.isPending || createSurvey.isPending) ? "Salvando..." : isNewSurvey ? "Criar Pesquisa" : "Salvar"}
            </Button>
          </div>
        </div>

        <Tabs defaultValue={isNewSurvey ? "settings" : "questions"} className="w-full">
          <TabsList className="grid w-full grid-cols-7 max-w-5xl">
            <TabsTrigger value="questions" className="gap-2" disabled={isNewSurvey} data-testid="tab-questions">
              <FileText className="w-4 h-4" /> Perguntas
            </TabsTrigger>
            <TabsTrigger value="quotas" className="gap-2" disabled={isNewSurvey} data-testid="tab-quotas">
              <Target className="w-4 h-4" /> Cotas
            </TabsTrigger>
            <TabsTrigger value="interviewers" className="gap-2" disabled={isNewSurvey} data-testid="tab-interviewers">
              <Users className="w-4 h-4" /> Entrevistadores
            </TabsTrigger>
            <TabsTrigger value="coordinators" className="gap-2" disabled={isNewSurvey} data-testid="tab-coordinators">
              <Users className="w-4 h-4" /> Coordenadores
            </TabsTrigger>
            <TabsTrigger value="viewers" className="gap-2" disabled={isNewSurvey} data-testid="tab-viewers">
              <Users className="w-4 h-4" /> Visualizadores
            </TabsTrigger>
            <TabsTrigger value="viewer-config" className="gap-2" disabled={isNewSurvey} data-testid="tab-viewer-config">
              <Eye className="w-4 h-4" /> Exibição
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-2" data-testid="tab-settings">
              <Settings2 className="w-4 h-4" /> Config
            </TabsTrigger>
          </TabsList>

          <TabsContent value="questions" className="mt-6">
            <div className="space-y-4">
              {questions.length > 0 ? (
                questions.map((q, index) => (
                  <Card key={q.id || `new-${index}`} data-testid={`card-question-${index}`}>
                    <CardContent className="p-6">
                      <div className="flex items-start gap-4">
                        <div className="flex flex-col items-center gap-1 text-muted-foreground shrink-0 pt-1">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6" 
                            onClick={() => moveQuestion(index, 'up')}
                            disabled={index === 0}
                            data-testid={`button-move-up-${index}`}
                          >
                            <ChevronUp className="w-4 h-4" />
                          </Button>
                          <span className="font-mono text-sm">{index + 1}</span>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6" 
                            onClick={() => moveQuestion(index, 'down')}
                            disabled={index === questions.length - 1}
                            data-testid={`button-move-down-${index}`}
                          >
                            <ChevronDown className="w-4 h-4" />
                          </Button>
                        </div>
                        <div className="flex-1 space-y-4">
                          <div className="flex items-start gap-4">
                            <div className="flex-1">
                              <Input
                                placeholder="Digite a pergunta..."
                                value={q.text}
                                onChange={(e) => updateQuestionField(index, "text", e.target.value)}
                                className="text-base"
                                data-testid={`input-question-${index}`}
                              />
                            </div>
                            <Select value={q.type} onValueChange={(v) => updateQuestionField(index, "type", v)}>
                              <SelectTrigger className="w-44" data-testid={`select-type-${index}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {questionTypes.map(t => (
                                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {(q.type === "single_choice" || q.type === "multiple_choice") && (
                            <div className="space-y-2 pl-4 border-l-2 border-muted">
                              {q.options.map((opt, optIndex) => (
                                <OptionEditor
                                  key={optIndex}
                                  option={opt}
                                  optIndex={optIndex}
                                  questionIndex={index}
                                  canDelete={q.options.length > 2}
                                  showImages={q.showOptionImages}
                                  onUpdate={(newOpt) => {
                                    const newOptions = [...q.options];
                                    newOptions[optIndex] = newOpt;
                                    updateQuestionField(index, "options", newOptions);
                                  }}
                                  onDelete={() => {
                                    const newOptions = q.options.filter((_, i) => i !== optIndex);
                                    updateQuestionField(index, "options", newOptions);
                                  }}
                                />
                              ))}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => updateQuestionField(index, "options", [...q.options, { text: `Opcao ${q.options.length + 1}` }])}
                                className="mt-2"
                                data-testid={`button-add-option-${index}`}
                              >
                                <Plus className="w-4 h-4 mr-2" /> Adicionar Opcao
                              </Button>
                            </div>
                          )}

                          <div className="flex items-center justify-between pt-2 border-t flex-wrap gap-4">
                            <div className="flex items-center gap-4 flex-wrap">
                              <div className="flex items-center gap-2">
                                <Switch
                                  checked={q.required}
                                  onCheckedChange={(v) => updateQuestionField(index, "required", v)}
                                  data-testid={`switch-required-${index}`}
                                />
                                <Label className="text-sm text-muted-foreground">Obrigatoria</Label>
                              </div>
                              {(q.type === "single_choice" || q.type === "multiple_choice") && (
                                <>
                                  <div className="flex items-center gap-2">
                                    <Switch
                                      checked={q.shuffleOptions ?? false}
                                      onCheckedChange={(v) => updateQuestionField(index, "shuffleOptions", v)}
                                      data-testid={`switch-shuffle-options-${index}`}
                                    />
                                    <Label className="text-sm text-muted-foreground">Embaralhar opcoes</Label>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Switch
                                      checked={q.showOptionImages ?? false}
                                      onCheckedChange={(v) => updateQuestionField(index, "showOptionImages", v)}
                                      data-testid={`switch-show-images-${index}`}
                                    />
                                    <Label className="text-sm text-muted-foreground">Fotos nas opcoes</Label>
                                  </div>
                                </>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => setSkipLogicQuestionIndex(index)} 
                                data-testid={`button-skip-logic-${index}`}
                              >
                                <GitBranch className="w-4 h-4 mr-2" /> 
                                Logica
                                {q.logic?.rules && q.logic.rules.length > 0 && (
                                  <Badge variant="secondary" className="ml-1">{q.logic.rules.length}</Badge>
                                )}
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => handleSaveQuestion(index)} data-testid={`button-save-question-${index}`}>
                                <CheckCircle className="w-4 h-4 mr-2" /> Salvar
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => handleDeleteQuestion(index)} data-testid={`button-delete-question-${index}`}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card className="border-dashed">
                  <CardContent className="py-12 text-center">
                    {isNewSurvey ? (
                      <p className="text-muted-foreground">Salve a pesquisa primeiro para adicionar perguntas.</p>
                    ) : (
                      <p className="text-muted-foreground mb-4">Nenhuma pergunta ainda. Adicione a primeira pergunta.</p>
                    )}
                  </CardContent>
                </Card>
              )}

              {!isNewSurvey && (
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 gap-2" onClick={handleAddQuestion} data-testid="button-add-question">
                    <Plus className="w-4 h-4" /> Adicionar Pergunta
                  </Button>
                  {questionModules.length > 0 && (
                    <Button variant="outline" className="gap-2" onClick={() => setModulesDialogOpen(true)} data-testid="button-import-module">
                      <Layers className="w-4 h-4" /> Importar Modulo
                    </Button>
                  )}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="interviewers" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Entrevistadores Designados</CardTitle>
                <CardDescription>Escolha quais entrevistadores podem coletar dados nesta pesquisa</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Assigned interviewers */}
                <div className="space-y-3">
                  <Label>Entrevistadores atribuídos a esta pesquisa</Label>
                  {assignmentsLoading ? (
                    <p className="text-sm text-muted-foreground p-3 bg-muted rounded-lg">Carregando...</p>
                  ) : assignments.length > 0 ? (
                    <div className="space-y-2">
                      {assignments.map((a: any) => (
                        <div key={a.interviewerId} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback>
                                {(a.interviewer?.firstName?.[0] || a.interviewer?.email?.[0] || '?').toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium text-sm">
                                {a.interviewer?.firstName && a.interviewer?.lastName
                                  ? `${a.interviewer.firstName} ${a.interviewer.lastName}`
                                  : a.interviewer?.email || 'Entrevistador'}
                              </p>
                              <p className="text-xs text-muted-foreground">{a.interviewer?.email}</p>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => unassignInterviewer.mutate(a.interviewerId)}
                            disabled={unassignInterviewer.isPending}
                            data-testid={`button-unassign-${a.interviewerId}`}
                          >
                            <UserMinus className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground p-3 bg-muted rounded-lg">
                      Nenhum entrevistador designado. Adicione entrevistadores abaixo.
                    </p>
                  )}
                </div>

                {/* Available interviewers to assign */}
                <div className="space-y-3 pt-4 border-t">
                  <Label>Adicionar entrevistador</Label>
                  {interviewersLoading ? (
                    <p className="text-sm text-muted-foreground p-3 bg-muted rounded-lg">Carregando entrevistadores...</p>
                  ) : (() => {
                    const assignedIds = assignments.map((a: any) => a.interviewerId);
                    const unassigned = availableInterviewers.filter((i: any) => !assignedIds.includes(i.userId));
                    
                    if (unassigned.length === 0) {
                      return (
                        <p className="text-sm text-muted-foreground p-3 bg-muted rounded-lg">
                          {availableInterviewers.length === 0
                            ? "Não há entrevistadores cadastrados na organização. Adicione membros com a função 'Entrevistador' na página de Equipe."
                            : "Todos os entrevistadores já estão designados para esta pesquisa."}
                        </p>
                      );
                    }

                    return (
                      <div className="space-y-2">
                        {unassigned.map((i: any) => (
                          <div key={i.userId} className="flex items-center justify-between p-3 border rounded-lg">
                            <div className="flex items-center gap-3">
                              <Avatar className="h-8 w-8">
                                <AvatarFallback>
                                  {(i.user?.firstName?.[0] || i.user?.email?.[0] || '?').toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-medium text-sm">
                                  {i.user?.firstName && i.user?.lastName
                                    ? `${i.user.firstName} ${i.user.lastName}`
                                    : i.user?.email || 'Entrevistador'}
                                </p>
                                <p className="text-xs text-muted-foreground">{i.user?.email}</p>
                              </div>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => assignInterviewer.mutate(i.userId)}
                              disabled={assignInterviewer.isPending}
                              data-testid={`button-assign-${i.userId}`}
                            >
                              <UserPlus className="w-4 h-4 mr-2" /> Adicionar
                            </Button>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="coordinators" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Coordenadores Designados</CardTitle>
                <CardDescription>Escolha quais coordenadores supervisionam esta pesquisa</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Assigned coordinators */}
                <div className="space-y-3">
                  <Label>Coordenadores atribuidos a esta pesquisa</Label>
                  {coordinatorAssignmentsLoading ? (
                    <p className="text-sm text-muted-foreground p-3 bg-muted rounded-lg">Carregando...</p>
                  ) : coordinatorAssignments.length > 0 ? (
                    <div className="space-y-2">
                      {coordinatorAssignments.map((a: any) => (
                        <div key={a.coordinatorId} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback>
                                {(a.coordinator?.firstName?.[0] || a.coordinator?.email?.[0] || '?').toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium text-sm">
                                {a.coordinator?.firstName && a.coordinator?.lastName
                                  ? `${a.coordinator.firstName} ${a.coordinator.lastName}`
                                  : a.coordinator?.email || 'Coordenador'}
                              </p>
                              <p className="text-xs text-muted-foreground">{a.coordinator?.email}</p>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => unassignCoordinator.mutate(a.coordinatorId)}
                            disabled={unassignCoordinator.isPending}
                            data-testid={`button-unassign-coordinator-${a.coordinatorId}`}
                          >
                            <UserMinus className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground p-3 bg-muted rounded-lg">
                      Nenhum coordenador designado. Adicione coordenadores abaixo.
                    </p>
                  )}
                </div>

                {/* Available coordinators to assign */}
                <div className="space-y-3 pt-4 border-t">
                  <Label>Adicionar coordenador</Label>
                  {coordinatorsLoading ? (
                    <p className="text-sm text-muted-foreground p-3 bg-muted rounded-lg">Carregando coordenadores...</p>
                  ) : (() => {
                    const assignedIds = coordinatorAssignments.map((a: any) => a.coordinatorId);
                    const unassigned = availableCoordinators.filter((c: any) => !assignedIds.includes(c.userId));
                    
                    if (unassigned.length === 0) {
                      return (
                        <p className="text-sm text-muted-foreground p-3 bg-muted rounded-lg">
                          {availableCoordinators.length === 0
                            ? "Nao ha coordenadores cadastrados na organizacao. Adicione membros com a funcao 'Coordenador' na pagina de Equipe."
                            : "Todos os coordenadores ja estao designados para esta pesquisa."}
                        </p>
                      );
                    }

                    return (
                      <div className="space-y-2">
                        {unassigned.map((c: any) => (
                          <div key={c.userId} className="flex items-center justify-between p-3 border rounded-lg">
                            <div className="flex items-center gap-3">
                              <Avatar className="h-8 w-8">
                                <AvatarFallback>
                                  {(c.user?.firstName?.[0] || c.user?.email?.[0] || '?').toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-medium text-sm">
                                  {c.user?.firstName && c.user?.lastName
                                    ? `${c.user.firstName} ${c.user.lastName}`
                                    : c.user?.email || 'Coordenador'}
                                </p>
                                <p className="text-xs text-muted-foreground">{c.user?.email}</p>
                              </div>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => assignCoordinator.mutate(c.userId)}
                              disabled={assignCoordinator.isPending}
                              data-testid={`button-assign-coordinator-${c.userId}`}
                            >
                              <UserPlus className="w-4 h-4 mr-2" /> Adicionar
                            </Button>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="viewers" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Visualizadores Designados</CardTitle>
                <CardDescription>Escolha quais visualizadores podem acessar os resultados desta pesquisa</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3">
                  <Label>Visualizadores atribuidos a esta pesquisa</Label>
                  {viewerAssignmentsLoading ? (
                    <p className="text-sm text-muted-foreground p-3 bg-muted rounded-lg">Carregando...</p>
                  ) : viewerAssignments.length > 0 ? (
                    <div className="space-y-2">
                      {viewerAssignments.map((a: any) => (
                        <div key={a.viewerId} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback>
                                {(a.viewer?.firstName?.[0] || a.viewer?.email?.[0] || '?').toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium text-sm">
                                {a.viewer?.firstName && a.viewer?.lastName
                                  ? `${a.viewer.firstName} ${a.viewer.lastName}`
                                  : a.viewer?.email || 'Visualizador'}
                              </p>
                              <p className="text-xs text-muted-foreground">{a.viewer?.email}</p>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => unassignViewer.mutate(a.viewerId)}
                            disabled={unassignViewer.isPending}
                            data-testid={`button-unassign-viewer-${a.viewerId}`}
                          >
                            <UserMinus className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground p-3 bg-muted rounded-lg">
                      Nenhum visualizador designado. Adicione visualizadores abaixo.
                    </p>
                  )}
                </div>

                <div className="space-y-3 pt-4 border-t">
                  <Label>Adicionar visualizador</Label>
                  {viewersLoading ? (
                    <p className="text-sm text-muted-foreground p-3 bg-muted rounded-lg">Carregando visualizadores...</p>
                  ) : (() => {
                    const assignedIds = viewerAssignments.map((a: any) => a.viewerId);
                    const unassigned = availableViewers.filter((v: any) => !assignedIds.includes(v.userId));
                    
                    if (unassigned.length === 0) {
                      return (
                        <p className="text-sm text-muted-foreground p-3 bg-muted rounded-lg">
                          {availableViewers.length === 0
                            ? "Nao ha visualizadores cadastrados na organizacao. Adicione membros com a funcao 'Visualizador' na pagina de Equipe."
                            : "Todos os visualizadores ja estao designados para esta pesquisa."}
                        </p>
                      );
                    }

                    return (
                      <div className="space-y-2">
                        {unassigned.map((v: any) => (
                          <div key={v.userId} className="flex items-center justify-between p-3 border rounded-lg">
                            <div className="flex items-center gap-3">
                              <Avatar className="h-8 w-8">
                                <AvatarFallback>
                                  {(v.user?.firstName?.[0] || v.user?.email?.[0] || '?').toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-medium text-sm">
                                  {v.user?.firstName && v.user?.lastName
                                    ? `${v.user.firstName} ${v.user.lastName}`
                                    : v.user?.email || 'Visualizador'}
                                </p>
                                <p className="text-xs text-muted-foreground">{v.user?.email}</p>
                              </div>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => assignViewer.mutate(v.userId)}
                              disabled={assignViewer.isPending}
                              data-testid={`button-assign-viewer-${v.userId}`}
                            >
                              <UserPlus className="w-4 h-4 mr-2" /> Adicionar
                            </Button>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="viewer-config" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="w-5 h-5" /> Configurar Exibição para Visualizadores
                </CardTitle>
                <CardDescription>
                  Controle quais elementos os visualizadores podem ver na página de resultados desta pesquisa.
                  Os cards de métricas (Universo, Realizadas, Margem de Erro, Período) e a Ficha Técnica são sempre visíveis.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-8">
                {viewerSettingsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <>
                    <div className="space-y-4">
                      <h3 className="font-medium text-base border-b pb-2">Filtros</h3>
                      <p className="text-sm text-muted-foreground">
                        Por padrão, filtros estão ocultos para visualizadores. Ative para permitir que filtrem os dados.
                      </p>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                          <div>
                            <p className="font-medium text-sm">Mostrar Painel de Filtros</p>
                            <p className="text-xs text-muted-foreground">Exibe a barra lateral de filtros</p>
                          </div>
                          <Switch
                            checked={viewerSettingsForm.showFilters}
                            onCheckedChange={(checked) => setViewerSettingsForm({...viewerSettingsForm, showFilters: checked})}
                            data-testid="switch-show-filters"
                          />
                        </div>
                        {viewerSettingsForm.showFilters && (
                          <div className="pl-4 space-y-2 border-l-2 border-muted ml-2">
                            <div className="flex items-center justify-between p-2 rounded">
                              <span className="text-sm">Filtro por Faixa Etária</span>
                              <Switch
                                checked={viewerSettingsForm.filterAgeGroup}
                                onCheckedChange={(checked) => setViewerSettingsForm({...viewerSettingsForm, filterAgeGroup: checked})}
                                data-testid="switch-filter-age"
                              />
                            </div>
                            <div className="flex items-center justify-between p-2 rounded">
                              <span className="text-sm">Filtro por Sexo</span>
                              <Switch
                                checked={viewerSettingsForm.filterGender}
                                onCheckedChange={(checked) => setViewerSettingsForm({...viewerSettingsForm, filterGender: checked})}
                                data-testid="switch-filter-gender"
                              />
                            </div>
                            <div className="flex items-center justify-between p-2 rounded">
                              <span className="text-sm">Filtro por Bairro/Zona</span>
                              <Switch
                                checked={viewerSettingsForm.filterNeighborhood}
                                onCheckedChange={(checked) => setViewerSettingsForm({...viewerSettingsForm, filterNeighborhood: checked})}
                                data-testid="switch-filter-neighborhood"
                              />
                            </div>
                            <div className="flex items-center justify-between p-2 rounded">
                              <span className="text-sm">Filtro por Entrevistador</span>
                              <Switch
                                checked={viewerSettingsForm.filterInterviewer}
                                onCheckedChange={(checked) => setViewerSettingsForm({...viewerSettingsForm, filterInterviewer: checked})}
                                data-testid="switch-filter-interviewer"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h3 className="font-medium text-base border-b pb-2">Abas de Navegação</h3>
                      <p className="text-sm text-muted-foreground">
                        Escolha quais abas estarão disponíveis para visualizadores.
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                          <span className="text-sm font-medium">Intenção</span>
                          <Switch
                            checked={viewerSettingsForm.showIntentionTab}
                            onCheckedChange={(checked) => setViewerSettingsForm({...viewerSettingsForm, showIntentionTab: checked})}
                            data-testid="switch-tab-intention"
                          />
                        </div>
                        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                          <span className="text-sm font-medium">Evolução</span>
                          <Switch
                            checked={viewerSettingsForm.showEvolutionTab}
                            onCheckedChange={(checked) => setViewerSettingsForm({...viewerSettingsForm, showEvolutionTab: checked})}
                            data-testid="switch-tab-evolution"
                          />
                        </div>
                        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                          <span className="text-sm font-medium">Cruzamentos</span>
                          <Switch
                            checked={viewerSettingsForm.showCrossingsTab}
                            onCheckedChange={(checked) => setViewerSettingsForm({...viewerSettingsForm, showCrossingsTab: checked})}
                            data-testid="switch-tab-crossings"
                          />
                        </div>
                        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                          <span className="text-sm font-medium">Perfil</span>
                          <Switch
                            checked={viewerSettingsForm.showProfileTab}
                            onCheckedChange={(checked) => setViewerSettingsForm({...viewerSettingsForm, showProfileTab: checked})}
                            data-testid="switch-tab-profile"
                          />
                        </div>
                        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                          <span className="text-sm font-medium">Relatório</span>
                          <Switch
                            checked={viewerSettingsForm.showReportTab}
                            onCheckedChange={(checked) => setViewerSettingsForm({...viewerSettingsForm, showReportTab: checked})}
                            data-testid="switch-tab-report"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h3 className="font-medium text-base border-b pb-2">Cards de Resultado</h3>
                      <p className="text-sm text-muted-foreground">
                        Escolha quais cards de análise serão exibidos.
                      </p>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                          <div>
                            <p className="font-medium text-sm">Resultado Principal</p>
                            <p className="text-xs text-muted-foreground">Gráfico com os resultados da pergunta principal</p>
                          </div>
                          <Switch
                            checked={viewerSettingsForm.showMainResult}
                            onCheckedChange={(checked) => setViewerSettingsForm({...viewerSettingsForm, showMainResult: checked})}
                            data-testid="switch-card-main-result"
                          />
                        </div>
                        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                          <div>
                            <p className="font-medium text-sm">Breakdowns Demográficos</p>
                            <p className="text-xs text-muted-foreground">Análises detalhadas por segmento</p>
                          </div>
                          <Switch
                            checked={viewerSettingsForm.showDemographicBreakdowns}
                            onCheckedChange={(checked) => setViewerSettingsForm({...viewerSettingsForm, showDemographicBreakdowns: checked})}
                            data-testid="switch-card-demographics"
                          />
                        </div>
                        {viewerSettingsForm.showDemographicBreakdowns && (
                          <div className="pl-4 space-y-2 border-l-2 border-muted ml-2">
                            <div className="flex items-center justify-between p-2 rounded">
                              <span className="text-sm">Por Sexo</span>
                              <Switch
                                checked={viewerSettingsForm.showGenderBreakdown}
                                onCheckedChange={(checked) => setViewerSettingsForm({...viewerSettingsForm, showGenderBreakdown: checked})}
                                data-testid="switch-breakdown-gender"
                              />
                            </div>
                            <div className="flex items-center justify-between p-2 rounded">
                              <span className="text-sm">Por Idade</span>
                              <Switch
                                checked={viewerSettingsForm.showAgeBreakdown}
                                onCheckedChange={(checked) => setViewerSettingsForm({...viewerSettingsForm, showAgeBreakdown: checked})}
                                data-testid="switch-breakdown-age"
                              />
                            </div>
                            <div className="flex items-center justify-between p-2 rounded">
                              <span className="text-sm">Por Bairro/Zona</span>
                              <Switch
                                checked={viewerSettingsForm.showNeighborhoodBreakdown}
                                onCheckedChange={(checked) => setViewerSettingsForm({...viewerSettingsForm, showNeighborhoodBreakdown: checked})}
                                data-testid="switch-breakdown-neighborhood"
                              />
                            </div>
                          </div>
                        )}
                        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                          <div>
                            <p className="font-medium text-sm">Estatísticas de Entrevistadores</p>
                            <p className="text-xs text-muted-foreground">Dados sobre produção dos entrevistadores</p>
                          </div>
                          <Switch
                            checked={viewerSettingsForm.showInterviewerStats}
                            onCheckedChange={(checked) => setViewerSettingsForm({...viewerSettingsForm, showInterviewerStats: checked})}
                            data-testid="switch-card-interviewer-stats"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h3 className="font-medium text-base border-b pb-2">Exportação</h3>
                      <p className="text-sm text-muted-foreground">
                        Permita que visualizadores exportem os dados.
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                          <span className="text-sm font-medium">Exportar Excel</span>
                          <Switch
                            checked={viewerSettingsForm.allowExcelExport}
                            onCheckedChange={(checked) => setViewerSettingsForm({...viewerSettingsForm, allowExcelExport: checked})}
                            data-testid="switch-export-excel"
                          />
                        </div>
                        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                          <span className="text-sm font-medium">Exportar PDF</span>
                          <Switch
                            checked={viewerSettingsForm.allowPdfExport}
                            onCheckedChange={(checked) => setViewerSettingsForm({...viewerSettingsForm, allowPdfExport: checked})}
                            data-testid="switch-export-pdf"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end pt-4 border-t">
                      <Button 
                        onClick={() => saveViewerSettings.mutate(viewerSettingsForm)}
                        disabled={saveViewerSettings.isPending}
                        data-testid="button-save-viewer-settings"
                      >
                        {saveViewerSettings.isPending ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvando...
                          </>
                        ) : (
                          <>
                            <Save className="w-4 h-4 mr-2" /> Salvar Configurações
                          </>
                        )}
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="quotas" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="w-5 h-5" /> Controle de Cotas
                </CardTitle>
                <CardDescription>
                  Configure cotas para garantir amostragem representativa por segmento demografico
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                  <div>
                    <p className="font-medium">Sistema de Cotas</p>
                    <p className="text-sm text-muted-foreground">
                      Ative para controlar a distribuicao de entrevistas por segmento
                    </p>
                  </div>
                  <Switch
                    checked={quotas.enabled}
                    onCheckedChange={(enabled) => {
                      setQuotas({ ...quotas, enabled });
                      setHasChanges(true);
                    }}
                    data-testid="switch-quotas-enabled"
                  />
                </div>

                {quotas.enabled && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium">Grupos de Cotas</h3>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const newGroup: QuotaGroup = {
                            id: `quota-${Date.now()}`,
                            category: "gender",
                            name: "Novo Grupo",
                            enabled: true,
                            hardLimit: false,
                            targets: []
                          };
                          setQuotas({ ...quotas, groups: [...quotas.groups, newGroup] });
                          setHasChanges(true);
                        }}
                        data-testid="button-add-quota-group"
                      >
                        <Plus className="w-4 h-4 mr-2" /> Adicionar Grupo
                      </Button>
                    </div>

                    {quotas.groups.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <Target className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>Nenhum grupo de cotas configurado</p>
                        <p className="text-sm">Adicione grupos para definir metas por segmento</p>
                      </div>
                    ) : (
                      quotas.groups.map((group, groupIndex) => (
                        <Card key={group.id} data-testid={`card-quota-group-${groupIndex}`}>
                          <CardContent className="p-4 space-y-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-4 flex-1">
                                <Input
                                  value={group.name}
                                  onChange={(e) => {
                                    const updated = [...quotas.groups];
                                    updated[groupIndex] = { ...group, name: e.target.value };
                                    setQuotas({ ...quotas, groups: updated });
                                    setHasChanges(true);
                                  }}
                                  placeholder="Nome do grupo"
                                  className="max-w-xs"
                                  data-testid={`input-quota-name-${groupIndex}`}
                                />
                                <Select
                                  value={group.category}
                                  onValueChange={(v) => {
                                    const updated = [...quotas.groups];
                                    updated[groupIndex] = { ...group, category: v as QuotaGroup['category'] };
                                    setQuotas({ ...quotas, groups: updated });
                                    setHasChanges(true);
                                  }}
                                >
                                  <SelectTrigger className="w-40" data-testid={`select-quota-category-${groupIndex}`}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="gender">Genero</SelectItem>
                                    <SelectItem value="age">Faixa Etaria</SelectItem>
                                    <SelectItem value="neighborhood">Bairro</SelectItem>
                                    <SelectItem value="education">Escolaridade</SelectItem>
                                    <SelectItem value="income">Renda</SelectItem>
                                  </SelectContent>
                                </Select>
                                <div className="flex items-center gap-2">
                                  <Switch
                                    checked={group.hardLimit}
                                    onCheckedChange={(hardLimit) => {
                                      const updated = [...quotas.groups];
                                      updated[groupIndex] = { ...group, hardLimit };
                                      setQuotas({ ...quotas, groups: updated });
                                      setHasChanges(true);
                                    }}
                                    data-testid={`switch-hard-limit-${groupIndex}`}
                                  />
                                  <Label className="text-sm">Limite rigido</Label>
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  const updated = quotas.groups.filter((_, i) => i !== groupIndex);
                                  setQuotas({ ...quotas, groups: updated });
                                  setHasChanges(true);
                                }}
                                data-testid={`button-delete-quota-group-${groupIndex}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>

                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <Label className="text-sm text-muted-foreground">Metas por Segmento</Label>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    const newTarget: QuotaTarget = {
                                      id: `target-${Date.now()}`,
                                      value: "",
                                      targetCount: 0,
                                      currentCount: 0
                                    };
                                    const updated = [...quotas.groups];
                                    updated[groupIndex] = { ...group, targets: [...group.targets, newTarget] };
                                    setQuotas({ ...quotas, groups: updated });
                                    setHasChanges(true);
                                  }}
                                  data-testid={`button-add-target-${groupIndex}`}
                                >
                                  <Plus className="w-4 h-4 mr-1" /> Meta
                                </Button>
                              </div>

                              {group.targets.map((target, targetIndex) => {
                                const progress = target.targetCount > 0 
                                  ? Math.min(100, (target.currentCount / target.targetCount) * 100)
                                  : 0;
                                const isComplete = target.currentCount >= target.targetCount && target.targetCount > 0;
                                const isOverLimit = target.currentCount > target.targetCount && target.targetCount > 0;

                                return (
                                  <div key={target.id} className="flex items-center gap-3 p-3 bg-muted/30 rounded-md">
                                    <Input
                                      value={target.value}
                                      onChange={(e) => {
                                        const updatedTargets = [...group.targets];
                                        updatedTargets[targetIndex] = { ...target, value: e.target.value };
                                        const updated = [...quotas.groups];
                                        updated[groupIndex] = { ...group, targets: updatedTargets };
                                        setQuotas({ ...quotas, groups: updated });
                                        setHasChanges(true);
                                      }}
                                      placeholder="Ex: Masculino, 18-24, Centro..."
                                      className="flex-1 max-w-[200px]"
                                      data-testid={`input-target-value-${groupIndex}-${targetIndex}`}
                                    />
                                    <div className="flex items-center gap-2">
                                      <Input
                                        type="number"
                                        min={0}
                                        value={target.targetCount}
                                        onChange={(e) => {
                                          const updatedTargets = [...group.targets];
                                          updatedTargets[targetIndex] = { ...target, targetCount: parseInt(e.target.value) || 0 };
                                          const updated = [...quotas.groups];
                                          updated[groupIndex] = { ...group, targets: updatedTargets };
                                          setQuotas({ ...quotas, groups: updated });
                                          setHasChanges(true);
                                        }}
                                        className="w-20"
                                        data-testid={`input-target-count-${groupIndex}-${targetIndex}`}
                                      />
                                      <span className="text-sm text-muted-foreground">meta</span>
                                    </div>
                                    <div className="flex-1 max-w-[150px]">
                                      <div className="flex items-center justify-between mb-1">
                                        <span className="text-xs text-muted-foreground">
                                          {target.currentCount}/{target.targetCount}
                                        </span>
                                        {isOverLimit && (
                                          <AlertTriangle className="w-3 h-3 text-amber-500" />
                                        )}
                                        {isComplete && !isOverLimit && (
                                          <CheckCircle className="w-3 h-3 text-green-500" />
                                        )}
                                      </div>
                                      <Progress value={progress} className="h-2" />
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => {
                                        const updatedTargets = group.targets.filter((_, i) => i !== targetIndex);
                                        const updated = [...quotas.groups];
                                        updated[groupIndex] = { ...group, targets: updatedTargets };
                                        setQuotas({ ...quotas, groups: updated });
                                        setHasChanges(true);
                                      }}
                                      data-testid={`button-delete-target-${groupIndex}-${targetIndex}`}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </div>
                                );
                              })}
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    )}

                    {quotas.groups.some(g => g.hardLimit) && (
                      <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md">
                        <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5" />
                        <div className="text-sm">
                          <p className="font-medium text-amber-800 dark:text-amber-200">Limite Rigido Ativo</p>
                          <p className="text-amber-700 dark:text-amber-300">
                            Novas entrevistas serao bloqueadas quando as cotas forem atingidas
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Configuracoes da Pesquisa</CardTitle>
                <CardDescription>Edite os detalhes e parametros da pesquisa</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="title">Titulo</Label>
                    <Input
                      id="title"
                      value={surveyForm.title}
                      onChange={(e) => { setSurveyForm({ ...surveyForm, title: e.target.value }); setHasChanges(true); }}
                      data-testid="input-settings-title"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="type">Tipo</Label>
                    <Select value={surveyForm.type} onValueChange={(v) => { setSurveyForm({ ...surveyForm, type: v }); setHasChanges(true); }}>
                      <SelectTrigger data-testid="select-settings-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="electoral">Eleitoral</SelectItem>
                        <SelectItem value="opinion">Opiniao</SelectItem>
                        <SelectItem value="market">Mercado</SelectItem>
                        <SelectItem value="census">Censo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Descricao</Label>
                  <Textarea
                    id="description"
                    value={surveyForm.description}
                    onChange={(e) => { setSurveyForm({ ...surveyForm, description: e.target.value }); setHasChanges(true); }}
                    data-testid="input-settings-description"
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="location">Localizacao</Label>
                    <Input
                      id="location"
                      value={surveyForm.location}
                      onChange={(e) => { setSurveyForm({ ...surveyForm, location: e.target.value }); setHasChanges(true); }}
                      data-testid="input-settings-location"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sample">Amostra Alvo</Label>
                    <Input
                      id="sample"
                      type="number"
                      value={surveyForm.targetSample}
                      onChange={(e) => { setSurveyForm({ ...surveyForm, targetSample: parseInt(e.target.value) || 400 }); setHasChanges(true); }}
                      data-testid="input-settings-sample"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="margin">Margem de Erro (%)</Label>
                    <Input
                      id="margin"
                      type="number"
                      step="0.1"
                      placeholder="Ex: 3"
                      value={surveyForm.marginOfError ?? ""}
                      onChange={(e) => { setSurveyForm({ ...surveyForm, marginOfError: e.target.value ? parseFloat(e.target.value) : null }); setHasChanges(true); }}
                      data-testid="input-settings-margin"
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="startDate">Data de Inicio</Label>
                    <Input
                      id="startDate"
                      type="date"
                      value={surveyForm.startDate}
                      onChange={(e) => { setSurveyForm({ ...surveyForm, startDate: e.target.value }); setHasChanges(true); }}
                      data-testid="input-settings-start-date"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="endDate">Data de Termino</Label>
                    <Input
                      id="endDate"
                      type="date"
                      value={surveyForm.endDate}
                      onChange={(e) => { setSurveyForm({ ...surveyForm, endDate: e.target.value }); setHasChanges(true); }}
                      data-testid="input-settings-end-date"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="status">Status</Label>
                    <Select value={surveyForm.status} onValueChange={(v) => { setSurveyForm({ ...surveyForm, status: v }); setHasChanges(true); }}>
                      <SelectTrigger data-testid="select-settings-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">Rascunho</SelectItem>
                        <SelectItem value="active">Ativa</SelectItem>
                        <SelectItem value="paused">Pausada</SelectItem>
                        <SelectItem value="completed">Concluída</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-3 pt-4 border-t">
                  <Label className="text-base font-medium">Randomizacao</Label>
                  <p className="text-sm text-muted-foreground">
                    Opcoes para evitar vies de ordem nas respostas
                  </p>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={surveyForm.shuffleQuestions}
                      onCheckedChange={(v) => { setSurveyForm({ ...surveyForm, shuffleQuestions: v }); setHasChanges(true); }}
                      data-testid="switch-shuffle-questions"
                    />
                    <Label className="text-sm text-muted-foreground">
                      Embaralhar ordem das perguntas
                    </Label>
                  </div>
                  <p className="text-xs text-muted-foreground pl-10">
                    Cada entrevista mostra as perguntas em ordem aleatoria diferente
                  </p>
                </div>

                <div className="space-y-3 pt-4 border-t">
                  <Label className="text-base font-medium">Captacao de Evidencias</Label>
                  <p className="text-sm text-muted-foreground">
                    Defina quais evidencias serao capturadas durante as entrevistas
                  </p>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={surveyForm.requireGps}
                      onCheckedChange={(v) => { setSurveyForm({ ...surveyForm, requireGps: v }); setHasChanges(true); }}
                      data-testid="switch-require-gps"
                    />
                    <Label className="text-sm text-muted-foreground">
                      Capturar localizacao GPS
                    </Label>
                  </div>
                  <p className="text-xs text-muted-foreground pl-10">
                    Registra as coordenadas geograficas de cada entrevista
                  </p>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={surveyForm.requireAudio}
                      onCheckedChange={(v) => { setSurveyForm({ ...surveyForm, requireAudio: v }); setHasChanges(true); }}
                      data-testid="switch-require-audio"
                    />
                    <Label className="text-sm text-muted-foreground">
                      Gravar audio da entrevista
                    </Label>
                  </div>
                  <p className="text-xs text-muted-foreground pl-10">
                    Grava o audio como evidencia de auditoria
                  </p>
                </div>

                <div className="flex justify-end pt-4 border-t">
                  <Button onClick={handleSaveSurvey} disabled={updateSurvey.isPending} data-testid="button-save-settings">
                    <Save className="w-4 h-4 mr-2" /> Salvar Configuracoes
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Floating Save Button at Bottom */}
        {hasChanges && (
          <div className="sticky bottom-0 left-0 right-0 p-4 bg-background border-t shadow-lg z-50">
            <div className="flex justify-end gap-3">
              <span className="text-sm text-muted-foreground self-center" data-testid="text-unsaved-changes">Alteracoes nao salvas</span>
              <Button onClick={handleSaveSurvey} disabled={updateSurvey.isPending || createSurvey.isPending} data-testid="button-save-survey-bottom">
                <Save className="w-4 h-4 mr-2" /> {(updateSurvey.isPending || createSurvey.isPending) ? "Salvando..." : "Salvar Tudo"}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Skip Logic Editor Modal */}
      {skipLogicQuestionIndex !== null && questions[skipLogicQuestionIndex] && (
        <SkipLogicEditor
          question={questions[skipLogicQuestionIndex]}
          questionIndex={skipLogicQuestionIndex}
          allQuestions={questions}
          onUpdate={(logic) => handleUpdateLogic(skipLogicQuestionIndex, logic)}
          open={true}
          onOpenChange={(open) => !open && setSkipLogicQuestionIndex(null)}
        />
      )}

      {/* Import Module Dialog */}
      <Dialog open={modulesDialogOpen} onOpenChange={setModulesDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Importar Modulo de Perguntas</DialogTitle>
            <DialogDescription>
              Selecione um modulo para adicionar suas perguntas a esta pesquisa
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[400px] pr-4">
            {questionModules.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Layers className="w-10 h-10 mx-auto mb-3 opacity-50" />
                <p>Nenhum modulo disponivel</p>
                <p className="text-sm">Crie modulos em Configuracoes - Modulos</p>
              </div>
            ) : (
              <div className="space-y-3">
                {questionModules.map((mod) => (
                  <Card 
                    key={mod.id} 
                    className="cursor-pointer hover-elevate active-elevate-2"
                    onClick={() => handleImportModule(mod)}
                    data-testid={`card-select-module-${mod.id}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium">{mod.name}</p>
                          {mod.description && (
                            <p className="text-sm text-muted-foreground line-clamp-2">{mod.description}</p>
                          )}
                        </div>
                        <Badge variant="secondary">
                          {(mod.questions as any[])?.length || 0} perguntas
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModulesDialogOpen(false)}>
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
