import { useOrganization, useCurrentMember } from "@/hooks/use-organizations";
import { useSurveys, useCreateSurvey } from "@/hooks/use-surveys";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import { Plus, FileText, MoreVertical, Play, Pause, BarChart3, Edit, ExternalLink, Copy, Trash2 } from "lucide-react";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { hasPermission, canManageSurveys, canViewAnalytics, isInterviewerRole, type UserRole } from "@shared/rbac";

export default function SurveysPage({ params }: { params: { orgId: string } }) {
  const orgId = parseInt(params.orgId);
  const { data: org, isLoading: orgLoading } = useOrganization(orgId);
  const { data: surveys, isLoading: surveysLoading } = useSurveys(orgId);
  const { data: currentMember, isLoading: memberLoading } = useCurrentMember(orgId);
  const createSurvey = useCreateSurvey();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  
  const userRole = (currentMember?.role || 'viewer') as UserRole;
  const canCreate = canManageSurveys(userRole);
  const canEdit = canManageSurveys(userRole);
  const canSeeResults = canViewAnalytics(userRole);
  const isInterviewer = isInterviewerRole(userRole);
  const [newSurvey, setNewSurvey] = useState({
    title: "",
    description: "",
    type: "electoral",
    location: "",
    targetSample: 400
  });

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

  return (
    <DashboardLayout orgId={params.orgId}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold">Pesquisas</h1>
            <p className="text-muted-foreground">
              {isInterviewer ? "Suas pesquisas designadas" : "Gerencie suas pesquisas e questionarios"}
            </p>
          </div>
          {canCreate && (
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
          )}
        </div>

        {surveys && surveys.length > 0 ? (
          <div className="grid gap-4">
            {surveys.map((survey) => (
              <Card key={survey.id} className="hover:shadow-md transition-shadow" data-testid={`card-survey-${survey.id}`}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4 flex-1 min-w-0">
                      <div className="p-3 bg-primary/10 rounded-lg text-primary shrink-0">
                        <FileText className="w-6 h-6" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-3 flex-wrap mb-1">
                          <h3 className="text-lg font-semibold truncate">{survey.title}</h3>
                          {getStatusBadge(survey.status)}
                          <Badge variant="outline" className="text-xs">{getTypeLabel(survey.type)}</Badge>
                        </div>
                        {survey.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{survey.description}</p>
                        )}
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          {survey.location && <span>{survey.location}</span>}
                          <span>Amostra: {survey.targetSample || 0}</span>
                          <span>Criada: {new Date(survey.createdAt!).toLocaleDateString('pt-BR')}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {canSeeResults && (
                        <Button variant="outline" size="sm" onClick={() => setLocation(`/org/${orgId}/surveys/${survey.id}/analytics`)} data-testid={`button-analytics-${survey.id}`}>
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
                        <Button size="sm" onClick={() => window.open(`/collect/${survey.id}`, '_blank')} data-testid={`button-collect-${survey.id}`}>
                          <Play className="w-4 h-4 mr-2" />
                          Iniciar Coleta
                        </Button>
                      ) : (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" data-testid={`button-more-${survey.id}`}>
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => navigator.clipboard.writeText(`${window.location.origin}/collect/${survey.id}`)}>
                              <Copy className="w-4 h-4 mr-2" />
                              Copiar Link de Coleta
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => window.open(`/collect/${survey.id}`, '_blank')}>
                              <ExternalLink className="w-4 h-4 mr-2" />
                              Abrir Coleta
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <FileText className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">
                {isInterviewer ? "Nenhuma pesquisa designada" : "Nenhuma pesquisa ainda"}
              </h3>
              <p className="text-muted-foreground mb-6 max-w-sm">
                {isInterviewer 
                  ? "Voce ainda nao foi designado para nenhuma pesquisa. Aguarde ser adicionado a uma pesquisa pelo coordenador."
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
      </div>
    </DashboardLayout>
  );
}
