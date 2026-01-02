import { useOrganization } from "@/hooks/use-organizations";
import { useSurvey, useUpdateSurvey, useCreateSurvey } from "@/hooks/use-surveys";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import { ArrowLeft, Save, Plus, GripVertical, Trash2, Play, Pause, ExternalLink, Copy, Settings2, FileText, CheckCircle } from "lucide-react";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { buildUrl, api } from "@shared/routes";

interface QuestionForm {
  id?: number;
  text: string;
  type: string;
  options: string[];
  required: boolean;
  order: number;
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
          options: Array.isArray(q.options) ? q.options : [],
          required: q.required ?? true,
          order: q.order
        })));
      }
    }
  }, [survey]);

  const createQuestion = useMutation({
    mutationFn: async (data: { text: string; type: string; options?: string[]; required: boolean; order: number }) => {
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
      options: ["Opção 1", "Opção 2"],
      required: true,
      order: questions.length + 1
    };
    setQuestions([...questions, newQuestion]);
    setHasChanges(true);
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
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="questions" className="gap-2" disabled={isNewSurvey} data-testid="tab-questions">
              <FileText className="w-4 h-4" /> Perguntas
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
                            <div className="space-y-2 pl-4 border-l-2 border-muted">
                              {q.options.map((opt, optIndex) => (
                                <div key={optIndex} className="flex items-center gap-2">
                                  <Input
                                    value={opt}
                                    onChange={(e) => {
                                      const newOptions = [...q.options];
                                      newOptions[optIndex] = e.target.value;
                                      updateQuestionField(index, "options", newOptions);
                                    }}
                                    placeholder={`Opcao ${optIndex + 1}`}
                                    className="flex-1"
                                    data-testid={`input-option-${index}-${optIndex}`}
                                  />
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                      const newOptions = q.options.filter((_, i) => i !== optIndex);
                                      updateQuestionField(index, "options", newOptions);
                                    }}
                                    disabled={q.options.length <= 2}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              ))}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => updateQuestionField(index, "options", [...q.options, `Opcao ${q.options.length + 1}`])}
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
                <Button variant="outline" className="w-full gap-2" onClick={handleAddQuestion} data-testid="button-add-question">
                  <Plus className="w-4 h-4" /> Adicionar Pergunta
                </Button>
              )}
            </div>
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
    </DashboardLayout>
  );
}
