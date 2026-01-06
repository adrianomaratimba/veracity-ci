import { useOrganization } from "@/hooks/use-organizations";
import { useSurvey, useUpdateSurvey, useCreateSurvey } from "@/hooks/use-surveys";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import { ArrowLeft, Save, Plus, GripVertical, Trash2, Play, Pause, ExternalLink, Copy, Settings2, FileText, CheckCircle, Users, UserPlus, UserMinus, Layers, Image, X, Loader2 } from "lucide-react";
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
  onUpdate: (opt: QuestionOption) => void;
  onDelete: () => void;
}

function OptionEditor({ option, optIndex, questionIndex, canDelete, onUpdate, onDelete }: OptionEditorProps) {
  const { uploadFile, isUploading } = useUpload();
  const fileInputRef = { current: null as HTMLInputElement | null };

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
    <div className="flex flex-col gap-2 p-3 bg-muted/30 rounded-lg">
      <div className="flex items-center gap-2">
        <Input
          value={option.text}
          onChange={(e) => onUpdate({ ...option, text: e.target.value })}
          placeholder={`Opcao ${optIndex + 1}`}
          className="flex-1"
          data-testid={`input-option-${questionIndex}-${optIndex}`}
        />
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
      
      <div className="flex items-center gap-2">
        {option.imageUrl ? (
          <div className="relative group">
            <img 
              src={option.imageUrl} 
              alt={option.text} 
              className="w-16 h-16 object-cover rounded-md border"
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
              size="sm"
              disabled={isUploading}
              onClick={() => document.getElementById(`image-${questionIndex}-${optIndex}`)?.click()}
              data-testid={`button-add-image-${questionIndex}-${optIndex}`}
            >
              {isUploading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Image className="w-4 h-4 mr-2" />
              )}
              {isUploading ? "Enviando..." : "Foto"}
            </Button>
          </>
        )}
        {option.imageUrl && (
          <span className="text-xs text-muted-foreground">Foto adicionada</span>
        )}
      </div>
    </div>
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

  const [surveyForm, setSurveyForm] = useState({
    title: "",
    description: "",
    type: "electoral",
    location: "",
    targetSample: 400,
    status: "draft"
  });

  const [questions, setQuestions] = useState<QuestionForm[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [modulesDialogOpen, setModulesDialogOpen] = useState(false);

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
        status: survey.status || "draft"
      });
      if (survey.questions) {
        setQuestions(survey.questions.map(q => ({
          id: q.id,
          text: q.text,
          type: q.type,
          options: normalizeOptions(q.options),
          required: q.required ?? true,
          order: q.order
        })));
      }
    }
  }, [survey]);

  const createQuestion = useMutation({
    mutationFn: async (data: { text: string; type: string; options?: QuestionOption[] | string[]; required: boolean; order: number }) => {
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
            targetSample: surveyForm.targetSample
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
            status: surveyForm.status
          }
        });
        toast({ title: "Salvo", description: "Pesquisa atualizada com sucesso!" });
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
    try {
      if (q.id) {
        await updateQuestion.mutateAsync({ id: q.id, data: { text: q.text, type: q.type, options: q.options, required: q.required } });
      } else {
        await createQuestion.mutateAsync({ text: q.text, type: q.type, options: q.options, required: q.required, order: q.order });
      }
      toast({ title: "Salvo", description: "Pergunta salva com sucesso!" });
    } catch (error) {
      toast({ title: "Erro", description: "Falha ao salvar pergunta", variant: "destructive" });
    }
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
          <TabsList className="grid w-full grid-cols-4 max-w-2xl">
            <TabsTrigger value="questions" className="gap-2" disabled={isNewSurvey} data-testid="tab-questions">
              <FileText className="w-4 h-4" /> Perguntas
            </TabsTrigger>
            <TabsTrigger value="interviewers" className="gap-2" disabled={isNewSurvey} data-testid="tab-interviewers">
              <Users className="w-4 h-4" /> Entrevistadores
            </TabsTrigger>
            <TabsTrigger value="coordinators" className="gap-2" disabled={isNewSurvey} data-testid="tab-coordinators">
              <Users className="w-4 h-4" /> Coordenadores
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-2" data-testid="tab-settings">
              <Settings2 className="w-4 h-4" /> Configuracoes
            </TabsTrigger>
          </TabsList>

          <TabsContent value="questions" className="mt-6">
            <div className="space-y-4">
              {questions.length > 0 ? (
                questions.map((q, index) => (
                  <Card key={q.id || `new-${index}`} data-testid={`card-question-${index}`}>
                    <CardContent className="p-6">
                      <div className="flex items-start gap-4">
                        <div className="flex items-center gap-2 text-muted-foreground shrink-0 pt-2">
                          <GripVertical className="w-5 h-5 cursor-grab" />
                          <span className="font-mono text-sm">{index + 1}</span>
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
                            <div className="space-y-3 pl-4 border-l-2 border-muted">
                              {q.options.map((opt, optIndex) => (
                                <OptionEditor
                                  key={optIndex}
                                  option={opt}
                                  optIndex={optIndex}
                                  questionIndex={index}
                                  canDelete={q.options.length > 2}
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

                          <div className="flex items-center justify-between pt-2 border-t">
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={q.required}
                                onCheckedChange={(v) => updateQuestionField(index, "required", v)}
                                data-testid={`switch-required-${index}`}
                              />
                              <Label className="text-sm text-muted-foreground">Obrigatoria</Label>
                            </div>
                            <div className="flex items-center gap-2">
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
                        <SelectItem value="eleitoral">Eleitoral</SelectItem>
                        <SelectItem value="opiniao">Opiniao</SelectItem>
                        <SelectItem value="mercado">Mercado</SelectItem>
                        <SelectItem value="censo">Censo</SelectItem>
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

                <div className="flex justify-end pt-4 border-t">
                  <Button onClick={handleSaveSurvey} disabled={updateSurvey.isPending} data-testid="button-save-settings">
                    <Save className="w-4 h-4 mr-2" /> Salvar Configuracoes
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

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
