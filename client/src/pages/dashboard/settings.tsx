import { useOrganization } from "@/hooks/use-organizations";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, CreditCard, Bell, Shield, Save, Check, AlertTriangle, Palette, Globe, Upload, Copy, ExternalLink, Layers, Plus, Pencil, Trash2, GripVertical, Key } from "lucide-react";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useUpload } from "@/hooks/use-upload";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { QuestionModule, OrganizationDomain, SubscriptionPlan } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

export default function SettingsPage({ params }: { params: { orgId: string } }) {
  const orgId = parseInt(params.orgId);
  const { data: org, isLoading: orgLoading } = useOrganization(orgId);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [orgForm, setOrgForm] = useState({
    name: "",
    slug: "",
    maxInterviews: 100,
    maxUsers: 5
  });

  const [brandingForm, setBrandingForm] = useState({
    brandingName: "",
    primaryColor: "#1e3a5f",
    secondaryColor: "#2563eb",
    hideVotoAuditBrand: false,
    logoUrl: ""
  });

  const [notifications, setNotifications] = useState({
    emailAlerts: true,
    fraudAlerts: true,
    dailyReports: false,
    weeklyReports: true
  });

  // Question modules state
  const [moduleDialogOpen, setModuleDialogOpen] = useState(false);
  const [editingModule, setEditingModule] = useState<QuestionModule | null>(null);
  const [deleteModuleId, setDeleteModuleId] = useState<number | null>(null);
  const [moduleForm, setModuleForm] = useState({
    name: "",
    description: "",
    questions: [] as Array<{
      text: string;
      type: "multiple_choice" | "text" | "number" | "rating" | "date";
      options: string[];
      required: boolean;
    }>
  });

  // Question modules query
  const { data: questionModules = [], isLoading: modulesLoading } = useQuery<QuestionModule[]>({
    queryKey: ['/api/organizations', orgId, 'question-modules'],
  });

  const createModule = useMutation({
    mutationFn: async (data: typeof moduleForm) => {
      return apiRequest("POST", `/api/organizations/${orgId}/question-modules`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', orgId, 'question-modules'] });
      toast({ title: "Sucesso", description: "Modulo criado com sucesso!" });
      setModuleDialogOpen(false);
      resetModuleForm();
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao criar modulo", variant: "destructive" });
    }
  });

  const updateModule = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof moduleForm }) => {
      return apiRequest("PATCH", `/api/organizations/${orgId}/question-modules/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', orgId, 'question-modules'] });
      toast({ title: "Sucesso", description: "Modulo atualizado!" });
      setModuleDialogOpen(false);
      setEditingModule(null);
      resetModuleForm();
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao atualizar modulo", variant: "destructive" });
    }
  });

  const deleteModule = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/organizations/${orgId}/question-modules/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', orgId, 'question-modules'] });
      toast({ title: "Sucesso", description: "Modulo excluido!" });
      setDeleteModuleId(null);
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao excluir modulo", variant: "destructive" });
    }
  });

  const seedDefaultModules = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/organizations/${orgId}/question-modules/seed-defaults`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', orgId, 'question-modules'] });
      toast({ title: "Sucesso", description: "Modulos padrao criados!" });
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao criar modulos padrao", variant: "destructive" });
    }
  });

  const resetModuleForm = () => {
    setModuleForm({ name: "", description: "", questions: [] });
    setEditingModule(null);
  };

  // Custom domains state
  const [newDomain, setNewDomain] = useState("");

  const { data: customDomains = [], isLoading: domainsLoading } = useQuery<OrganizationDomain[]>({
    queryKey: ['/api/organizations', orgId, 'domains'],
    enabled: org?.plan === 'enterprise',
  });

  const addDomain = useMutation({
    mutationFn: async (domain: string) => {
      return apiRequest("POST", `/api/organizations/${orgId}/domains`, { domain });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', orgId, 'domains'] });
      toast({ title: "Dominio adicionado", description: "Configure o DNS conforme as instrucoes" });
      setNewDomain("");
    },
    onError: (err: Error) => {
      toast({ title: "Erro", description: err.message || "Falha ao adicionar dominio", variant: "destructive" });
    }
  });

  const removeDomain = useMutation({
    mutationFn: async (domainId: number) => {
      return apiRequest("DELETE", `/api/organizations/${orgId}/domains/${domainId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', orgId, 'domains'] });
      toast({ title: "Dominio removido" });
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao remover dominio", variant: "destructive" });
    }
  });

  const verifyDomain = useMutation({
    mutationFn: async (domainId: number) => {
      return apiRequest("POST", `/api/organizations/${orgId}/domains/${domainId}/verify`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', orgId, 'domains'] });
      toast({ title: "Dominio verificado!" });
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao verificar dominio. Verifique a configuracao DNS.", variant: "destructive" });
    }
  });

  // Subscription plans query and editing
  const { data: allPlans = [] } = useQuery<SubscriptionPlan[]>({
    queryKey: ['/api/plans'],
  });

  // Check if current user is platform admin
  const { data: adminCheck } = useQuery<{ isAdmin: boolean }>({
    queryKey: ['/api/admin/check'],
  });
  const isPlatformAdmin = adminCheck?.isAdmin ?? false;

  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [planForm, setPlanForm] = useState({
    name: "",
    description: "",
    priceMonthly: 0,
    priceYearly: 0,
    maxSurveys: 1,
    maxInterviews: 100,
    maxUsers: 5,
    features: [] as string[]
  });

  const updatePlan = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof planForm }) => {
      return apiRequest("PATCH", `/api/plans/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/plans'] });
      toast({ title: "Plano atualizado" });
      setEditingPlan(null);
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao atualizar plano", variant: "destructive" });
    }
  });

  const handleEditPlan = (plan: SubscriptionPlan) => {
    setEditingPlan(plan);
    setPlanForm({
      name: plan.name,
      description: plan.description || "",
      priceMonthly: plan.priceMonthly || 0,
      priceYearly: plan.priceYearly || 0,
      maxSurveys: plan.maxSurveys || 1,
      maxInterviews: plan.maxInterviews || 100,
      maxUsers: plan.maxUsers || 5,
      features: (plan.features as string[]) || []
    });
  };

  const handleSavePlan = () => {
    if (editingPlan) {
      updatePlan.mutate({ id: editingPlan.id, data: planForm });
    }
  };

  // Platform Admin - Organizations management
  const { data: allOrganizations = [] } = useQuery<Array<{
    id: number;
    name: string;
    slug: string;
    plan: string;
    maxInterviews: number | null;
    maxSurveys: number | null;
    maxUsers: number | null;
    createdAt: string | null;
  }>>({
    queryKey: ['/api/admin/organizations'],
    enabled: isPlatformAdmin,
  });

  const updateOrgPlan = useMutation({
    mutationFn: async ({ orgId, plan }: { orgId: number; plan: string }) => {
      return apiRequest("PATCH", `/api/admin/organizations/${orgId}/plan`, { plan });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations'] });
      toast({ title: "Plano da organizacao atualizado!" });
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao atualizar plano", variant: "destructive" });
    }
  });

  // Platform Admin - All users
  const { data: allPlatformUsers = [] } = useQuery<Array<{
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    authProvider: string | null;
    hasPassword: boolean;
    emailVerified: boolean | null;
    createdAt: string | null;
    updatedAt: string | null;
  }>>({
    queryKey: ['/api/admin/users'],
    enabled: isPlatformAdmin,
  });

  // Password reset dialog state
  const [resetPasswordUser, setResetPasswordUser] = useState<typeof allPlatformUsers[0] | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const resetUserPassword = useMutation({
    mutationFn: async ({ userId, password }: { userId: string; password: string }) => {
      return apiRequest("POST", `/api/admin/users/${userId}/reset-password`, { password });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      toast({ title: "Senha redefinida com sucesso!" });
      setResetPasswordUser(null);
      setNewPassword("");
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao redefinir senha", variant: "destructive" });
    }
  });

  const handleResetPassword = () => {
    if (!resetPasswordUser || !newPassword || newPassword.length < 6) {
      toast({ title: "Erro", description: "Senha deve ter pelo menos 6 caracteres", variant: "destructive" });
      return;
    }
    resetUserPassword.mutate({ userId: resetPasswordUser.id, password: newPassword });
  };

  const handleEditModule = (module: QuestionModule) => {
    setEditingModule(module);
    setModuleForm({
      name: module.name,
      description: module.description || "",
      questions: (module.questions as any[]) || []
    });
    setModuleDialogOpen(true);
  };

  const handleSaveModule = () => {
    if (!moduleForm.name.trim()) {
      toast({ title: "Erro", description: "Nome do modulo e obrigatorio", variant: "destructive" });
      return;
    }
    if (moduleForm.questions.length === 0) {
      toast({ title: "Erro", description: "Adicione pelo menos uma pergunta", variant: "destructive" });
      return;
    }
    if (editingModule) {
      updateModule.mutate({ id: editingModule.id, data: moduleForm });
    } else {
      createModule.mutate(moduleForm);
    }
  };

  const addQuestion = () => {
    setModuleForm({
      ...moduleForm,
      questions: [
        ...moduleForm.questions,
        { text: "", type: "multiple_choice", options: [], required: true }
      ]
    });
  };

  const updateQuestion = (index: number, field: string, value: any) => {
    const newQuestions = [...moduleForm.questions];
    (newQuestions[index] as any)[field] = value;
    setModuleForm({ ...moduleForm, questions: newQuestions });
  };

  const removeQuestion = (index: number) => {
    const newQuestions = moduleForm.questions.filter((_, i) => i !== index);
    setModuleForm({ ...moduleForm, questions: newQuestions });
  };

  const { uploadFile, isUploading } = useUpload({
    onSuccess: (response) => {
      if (response) {
        setBrandingForm(prev => ({ ...prev, logoUrl: response.objectPath }));
        toast({ title: "Logo enviado", description: "Seu logo foi carregado com sucesso" });
      }
    },
    onError: (error) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  });

  useEffect(() => {
    if (org) {
      setOrgForm({
        name: org.name,
        slug: org.slug,
        maxInterviews: org.maxInterviews || 100,
        maxUsers: org.maxUsers || 5
      });
      setBrandingForm({
        brandingName: org.brandingName || "",
        primaryColor: org.primaryColor || "#1e3a5f",
        secondaryColor: org.secondaryColor || "#2563eb",
        hideVotoAuditBrand: org.hideVotoAuditBrand || false,
        logoUrl: org.logoUrl || ""
      });
    }
  }, [org]);

  const updateOrg = useMutation({
    mutationFn: async (data: { name: string; slug?: string }) => {
      const res = await fetch(`/api/organizations/${orgId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update organization");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', orgId] });
      toast({ title: "Salvo", description: "Configuracoes atualizadas com sucesso!" });
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao salvar configuracoes", variant: "destructive" });
    }
  });

  const updateBranding = useMutation({
    mutationFn: async (data: Partial<typeof brandingForm>) => {
      const res = await fetch(`/api/organizations/${orgId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update branding");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', orgId] });
      toast({ title: "Salvo", description: "Configuracoes de marca atualizadas!" });
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao salvar configuracoes de marca", variant: "destructive" });
    }
  });

  if (orgLoading) return <LoadingScreen message="Carregando configuracoes..." />;
  if (!org) return <div>Organizacao nao encontrada</div>;

  const handleSaveOrg = () => {
    updateOrg.mutate({ name: orgForm.name, slug: orgForm.slug });
  };

  const handleSaveBranding = () => {
    const changedFields: Partial<typeof brandingForm> = {};
    if (brandingForm.brandingName !== (org.brandingName || "")) changedFields.brandingName = brandingForm.brandingName;
    if (brandingForm.primaryColor !== (org.primaryColor || "#1e3a5f")) changedFields.primaryColor = brandingForm.primaryColor;
    if (brandingForm.secondaryColor !== (org.secondaryColor || "#2563eb")) changedFields.secondaryColor = brandingForm.secondaryColor;
    if (brandingForm.hideVotoAuditBrand !== (org.hideVotoAuditBrand || false)) changedFields.hideVotoAuditBrand = brandingForm.hideVotoAuditBrand;
    if (brandingForm.logoUrl !== (org.logoUrl || "")) changedFields.logoUrl = brandingForm.logoUrl;
    
    if (Object.keys(changedFields).length === 0) {
      toast({ title: "Sem alteracoes", description: "Nenhuma alteracao detectada" });
      return;
    }
    updateBranding.mutate(changedFields as typeof brandingForm);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await uploadFile(file);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copiado", description: "Link copiado para a area de transferencia" });
  };

  const getPlanBadge = (plan: string) => {
    const config: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
      'basico': { label: 'Basico', variant: 'secondary' },
      'pro': { label: 'Pro', variant: 'default' },
      'enterprise': { label: 'Enterprise', variant: 'default' },
    };
    const c = config[plan] || { label: plan, variant: 'secondary' as const };
    return <Badge variant={c.variant}>{c.label}</Badge>;
  };

  return (
    <DashboardLayout orgId={params.orgId}>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-display font-bold">Configuracoes</h1>
          <p className="text-muted-foreground">Gerencie as configuracoes da sua organizacao</p>
        </div>

        <Tabs defaultValue="general" className="w-full">
          <TabsList className="flex flex-wrap gap-1 w-full max-w-5xl">
            <TabsTrigger value="general" className="gap-2" data-testid="tab-general">
              <Building2 className="w-4 h-4" /> Geral
            </TabsTrigger>
            <TabsTrigger value="modules" className="gap-2" data-testid="tab-modules">
              <Layers className="w-4 h-4" /> Modulos
            </TabsTrigger>
            <TabsTrigger value="branding" className="gap-2" data-testid="tab-branding">
              <Palette className="w-4 h-4" /> Marca
            </TabsTrigger>
            <TabsTrigger value="domains" className="gap-2" data-testid="tab-domains">
              <Globe className="w-4 h-4" /> Dominios
            </TabsTrigger>
            <TabsTrigger value="billing" className="gap-2" data-testid="tab-billing">
              <CreditCard className="w-4 h-4" /> Plano
            </TabsTrigger>
            <TabsTrigger value="notifications" className="gap-2" data-testid="tab-notifications">
              <Bell className="w-4 h-4" /> Alertas
            </TabsTrigger>
            <TabsTrigger value="security" className="gap-2" data-testid="tab-security">
              <Shield className="w-4 h-4" /> Seguranca
            </TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Informacoes da Organizacao</CardTitle>
                <CardDescription>Dados basicos da sua organizacao</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome da Organizacao</Label>
                    <Input
                      id="name"
                      value={orgForm.name}
                      onChange={(e) => setOrgForm({ ...orgForm, name: e.target.value })}
                      data-testid="input-org-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="slug">Identificador (slug)</Label>
                    <Input
                      id="slug"
                      value={orgForm.slug}
                      onChange={(e) => setOrgForm({ ...orgForm, slug: e.target.value })}
                      data-testid="input-org-slug"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-4 border-t">
                  <Button onClick={handleSaveOrg} disabled={updateOrg.isPending} data-testid="button-save-org">
                    <Save className="w-4 h-4 mr-2" /> {updateOrg.isPending ? "Salvando..." : "Salvar Alteracoes"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="modules" className="mt-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
                <div>
                  <CardTitle>Modulos de Perguntas</CardTitle>
                  <CardDescription>Crie modulos reutilizaveis de perguntas demograficas para acelerar a criacao de pesquisas</CardDescription>
                </div>
                <Button 
                  onClick={() => { resetModuleForm(); setModuleDialogOpen(true); }}
                  data-testid="button-create-module"
                >
                  <Plus className="w-4 h-4 mr-2" /> Novo Modulo
                </Button>
              </CardHeader>
              <CardContent>
                {modulesLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Carregando modulos...</div>
                ) : questionModules.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Layers className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p className="font-medium">Nenhum modulo criado</p>
                    <p className="text-sm mt-1 mb-4">Crie modulos para reutilizar perguntas comuns como idade, sexo, escolaridade, etc.</p>
                    <Button 
                      variant="outline" 
                      onClick={() => seedDefaultModules.mutate()}
                      disabled={seedDefaultModules.isPending}
                      data-testid="button-seed-default-modules"
                    >
                      {seedDefaultModules.isPending ? "Criando..." : "Criar Modulos Padrao"}
                    </Button>
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {questionModules.map((mod) => (
                      <Card key={mod.id} className="relative" data-testid={`card-module-${mod.id}`}>
                        <CardHeader className="pb-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <CardTitle className="text-base truncate">{mod.name}</CardTitle>
                              {mod.description && (
                                <CardDescription className="line-clamp-2 text-xs mt-1">{mod.description}</CardDescription>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => handleEditModule(mod)}
                                data-testid={`button-edit-module-${mod.id}`}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon"
                                onClick={() => setDeleteModuleId(mod.id)}
                                data-testid={`button-delete-module-${mod.id}`}
                              >
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <Badge variant="secondary">
                            {(mod.questions as any[])?.length || 0} perguntas
                          </Badge>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="branding" className="mt-6">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Identidade Visual</CardTitle>
                  <CardDescription>Personalize a aparencia do sistema com sua marca</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="brandingName">Nome da Marca (opcional)</Label>
                    <Input
                      id="brandingName"
                      placeholder="Ex: Minha Empresa Pesquisas"
                      value={brandingForm.brandingName}
                      onChange={(e) => setBrandingForm({ ...brandingForm, brandingName: e.target.value })}
                      data-testid="input-branding-name"
                    />
                    <p className="text-xs text-muted-foreground">Substitui "Veracity" na interface</p>
                  </div>

                  <div className="space-y-2">
                    <Label>Logo da Empresa</Label>
                    <div className="flex items-center gap-4">
                      {brandingForm.logoUrl ? (
                        <div className="w-20 h-20 border rounded-lg flex items-center justify-center overflow-hidden bg-muted">
                          <img src={brandingForm.logoUrl} alt="Logo" className="max-w-full max-h-full object-contain" />
                        </div>
                      ) : (
                        <div className="w-20 h-20 border rounded-lg flex items-center justify-center bg-muted">
                          <Upload className="w-8 h-8 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1">
                        <Input
                          type="file"
                          accept="image/*"
                          onChange={handleLogoUpload}
                          disabled={isUploading}
                          data-testid="input-logo-upload"
                        />
                        <p className="text-xs text-muted-foreground mt-1">PNG, JPG ou SVG. Max 2MB</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="primaryColor">Cor Primaria</Label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          id="primaryColor"
                          value={brandingForm.primaryColor}
                          onChange={(e) => setBrandingForm({ ...brandingForm, primaryColor: e.target.value })}
                          className="w-10 h-10 rounded border cursor-pointer"
                          data-testid="input-primary-color"
                        />
                        <Input
                          value={brandingForm.primaryColor}
                          onChange={(e) => setBrandingForm({ ...brandingForm, primaryColor: e.target.value })}
                          className="flex-1 font-mono"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="secondaryColor">Cor Secundaria</Label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          id="secondaryColor"
                          value={brandingForm.secondaryColor}
                          onChange={(e) => setBrandingForm({ ...brandingForm, secondaryColor: e.target.value })}
                          className="w-10 h-10 rounded border cursor-pointer"
                          data-testid="input-secondary-color"
                        />
                        <Input
                          value={brandingForm.secondaryColor}
                          onChange={(e) => setBrandingForm({ ...brandingForm, secondaryColor: e.target.value })}
                          className="flex-1 font-mono"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t">
                    <div>
                      <p className="font-medium">Ocultar Marca Veracity</p>
                      <p className="text-sm text-muted-foreground">Remove referencias ao Veracity</p>
                    </div>
                    <Switch
                      checked={brandingForm.hideVotoAuditBrand}
                      onCheckedChange={(v) => setBrandingForm({ ...brandingForm, hideVotoAuditBrand: v })}
                      data-testid="switch-hide-brand"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Pre-visualizacao</CardTitle>
                  <CardDescription>Veja como sua marca aparecera</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="border rounded-lg p-6 bg-muted/30">
                    <div className="flex items-center gap-3 mb-6">
                      {brandingForm.logoUrl ? (
                        <img src={brandingForm.logoUrl} alt="Logo" className="w-10 h-10 object-contain" />
                      ) : (
                        <div className="w-10 h-10 rounded" style={{ backgroundColor: brandingForm.primaryColor }} />
                      )}
                      <span className="font-bold text-lg">
                        {brandingForm.brandingName || org.name}
                      </span>
                    </div>
                    <div className="space-y-3">
                      <Button 
                        style={{ backgroundColor: brandingForm.primaryColor }}
                        className="w-full"
                      >
                        Botao Primario
                      </Button>
                      <Button 
                        variant="outline"
                        style={{ borderColor: brandingForm.secondaryColor, color: brandingForm.secondaryColor }}
                        className="w-full"
                      >
                        Botao Secundario
                      </Button>
                    </div>
                  </div>

                  <div className="flex justify-end pt-4 mt-4 border-t">
                    <Button onClick={handleSaveBranding} disabled={updateBranding.isPending} data-testid="button-save-branding">
                      <Save className="w-4 h-4 mr-2" /> {updateBranding.isPending ? "Salvando..." : "Salvar Marca"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="domains" className="mt-6">
            <div className="grid gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Subdominio Padrao</CardTitle>
                  <CardDescription>Seu endereco padrao no Veracity</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 p-4 bg-muted rounded-lg">
                    <Globe className="w-5 h-5 text-muted-foreground" />
                    <span className="font-mono text-sm flex-1">{org.slug}.veracity.app</span>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => copyToClipboard(`${org.slug}.veracity.app`)}
                      data-testid="button-copy-subdomain"
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => window.open(`https://${org.slug}.veracity.app`, '_blank')}
                      data-testid="button-open-subdomain"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Dominio Personalizado</CardTitle>
                  <CardDescription>Use seu proprio dominio (ex: pesquisas.suaempresa.com.br)</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {org.plan !== 'enterprise' ? (
                    <div className="p-4 bg-muted/50 border rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline">Plano Enterprise</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Dominios personalizados estao disponiveis apenas no plano Enterprise.
                        Fale conosco para fazer upgrade.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="customDomain">Adicionar Dominio</Label>
                        <div className="flex gap-2">
                          <Input
                            id="customDomain"
                            placeholder="pesquisas.suaempresa.com.br"
                            value={newDomain}
                            onChange={(e) => setNewDomain(e.target.value)}
                            data-testid="input-custom-domain"
                          />
                          <Button 
                            onClick={() => addDomain.mutate(newDomain)}
                            disabled={!newDomain.trim() || addDomain.isPending}
                            data-testid="button-add-domain"
                          >
                            {addDomain.isPending ? "Adicionando..." : "Adicionar"}
                          </Button>
                        </div>
                      </div>

                      {customDomains.length > 0 && (
                        <div className="space-y-2">
                          <Label>Seus Dominios</Label>
                          <div className="space-y-2">
                            {customDomains.map((domain) => (
                              <div key={domain.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                                <div className="flex items-center gap-3">
                                  <Globe className="w-4 h-4 text-muted-foreground" />
                                  <span className="font-mono text-sm">{domain.domain}</span>
                                  <Badge variant={domain.dnsStatus === 'verified' ? 'default' : 'outline'}>
                                    {domain.dnsStatus === 'verified' ? 'Verificado' : 'Pendente'}
                                  </Badge>
                                </div>
                                <div className="flex items-center gap-2">
                                  {domain.dnsStatus !== 'verified' && (
                                    <Button 
                                      variant="outline" 
                                      size="sm"
                                      onClick={() => verifyDomain.mutate(domain.id)}
                                      disabled={verifyDomain.isPending}
                                      data-testid={`button-verify-domain-${domain.id}`}
                                    >
                                      Verificar
                                    </Button>
                                  )}
                                  <Button 
                                    variant="ghost" 
                                    size="icon"
                                    onClick={() => removeDomain.mutate(domain.id)}
                                    disabled={removeDomain.isPending}
                                    data-testid={`button-remove-domain-${domain.id}`}
                                  >
                                    <Trash2 className="w-4 h-4 text-destructive" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="text-sm text-muted-foreground p-3 bg-muted/50 rounded-lg">
                        <p className="font-medium mb-2">Instrucoes de configuracao DNS:</p>
                        <ol className="list-decimal list-inside space-y-1">
                          <li>Acesse o painel do seu provedor de dominio</li>
                          <li>Adicione um registro CNAME apontando para: <code className="bg-muted px-1 rounded">proxy.veracity.app</code></li>
                          <li>Desative o proxy do Cloudflare (use DNS Only)</li>
                          <li>Aguarde a propagacao DNS (pode levar ate 48h)</li>
                        </ol>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="billing" className="mt-6">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Seu Plano Atual</CardTitle>
                  <CardDescription>Detalhes do seu plano de assinatura</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <span className="text-2xl font-bold capitalize">{org.plan}</span>
                        {getPlanBadge(org.plan)}
                      </div>
                      <p className="text-sm text-muted-foreground">Renovacao automatica mensal</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Entrevistas/mes</span>
                      <span className="font-medium">{org.maxInterviews || 100}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Usuarios</span>
                      <span className="font-medium">{org.maxUsers || 5}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Armazenamento de audio</span>
                      <span className="font-medium">{org.plan === 'basico' ? '5 GB' : org.plan === 'pro' ? '50 GB' : 'Ilimitado'}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Upgrade de Plano</CardTitle>
                  <CardDescription>Desbloqueie mais recursos</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {org.plan !== 'pro' && (
                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="font-semibold">Plano Pro</span>
                        <Badge>Popular</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">1.000 entrevistas/mes, 20 usuarios, 50 GB</p>
                      <Button className="w-full" data-testid="button-upgrade-pro">Fazer Upgrade</Button>
                    </div>
                  )}
                  {org.plan !== 'enterprise' && (
                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="font-semibold">Enterprise</span>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">Ilimitado, suporte prioritario, SLA</p>
                      <Button variant="outline" className="w-full" data-testid="button-contact-sales">Falar com Vendas</Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {isPlatformAdmin && (
                <Card>
                  <CardHeader>
                    <CardTitle>Gerenciar Planos</CardTitle>
                    <CardDescription>Configure os planos disponiveis na plataforma (apenas administradores)</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {allPlans.map((plan) => (
                      <div key={plan.id} className="p-4 border rounded-lg">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div>
                            <span className="font-semibold">{plan.name}</span>
                            <Badge variant="outline" className="ml-2">{plan.id}</Badge>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => handleEditPlan(plan)}
                            data-testid={`button-edit-plan-${plan.id}`}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">{plan.description}</p>
                        <div className="grid grid-cols-3 gap-2 text-sm">
                          <div>
                            <span className="text-muted-foreground">Preco mensal:</span>
                            <span className="font-medium ml-1">
                              {plan.priceMonthly === 0 ? 'Gratis' : `R$ ${((plan.priceMonthly || 0) / 100).toFixed(2)}`}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Pesquisas:</span>
                            <span className="font-medium ml-1">{plan.maxSurveys === -1 ? 'Ilimitado' : plan.maxSurveys}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Usuarios:</span>
                            <span className="font-medium ml-1">{plan.maxUsers === -1 ? 'Ilimitado' : plan.maxUsers}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {isPlatformAdmin && (
                <Card>
                  <CardHeader>
                    <CardTitle>Planos por Organizacao</CardTitle>
                    <CardDescription>Altere o plano de clientes especificos (apenas administradores)</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[400px] pr-4">
                      <div className="space-y-3">
                        {allOrganizations.map((o) => (
                          <div key={o.id} className="p-4 border rounded-lg flex items-center justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold truncate">{o.name}</span>
                                <Badge variant="outline" className="text-xs">{o.slug}</Badge>
                              </div>
                              <p className="text-sm text-muted-foreground mt-1">
                                {o.maxSurveys === -1 ? 'Ilimitado' : o.maxSurveys} pesquisas, {o.maxInterviews === -1 ? 'Ilimitado' : o.maxInterviews} entrevistas, {o.maxUsers === -1 ? 'Ilimitado' : o.maxUsers} usuarios
                              </p>
                            </div>
                            <Select
                              value={o.plan}
                              onValueChange={(newPlan) => updateOrgPlan.mutate({ orgId: o.id, plan: newPlan })}
                              disabled={updateOrgPlan.isPending}
                            >
                              <SelectTrigger className="w-[140px]" data-testid={`select-org-plan-${o.id}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="basic">Basico</SelectItem>
                                <SelectItem value="pro">Profissional</SelectItem>
                                <SelectItem value="enterprise">Enterprise</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        ))}
                        {allOrganizations.length === 0 && (
                          <p className="text-center text-muted-foreground py-4">Nenhuma organizacao encontrada</p>
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              )}

              {isPlatformAdmin && (
                <Card>
                  <CardHeader>
                    <CardTitle>Gerenciar Usuarios</CardTitle>
                    <CardDescription>Redefina senhas e gerencie usuarios da plataforma (apenas administradores)</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[400px] pr-4">
                      <div className="space-y-3">
                        {allPlatformUsers.map((u) => (
                          <div key={u.id} className="p-4 border rounded-lg flex items-center justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold truncate">{u.email}</span>
                                <Badge variant={u.authProvider === 'credentials' ? 'default' : u.authProvider === 'replit' ? 'secondary' : 'outline'} className="text-xs">
                                  {u.authProvider === 'credentials' ? 'Senha' : u.authProvider === 'replit' ? 'Replit' : 'Pendente'}
                                </Badge>
                                {u.hasPassword && <Badge variant="outline" className="text-xs">Senha configurada</Badge>}
                              </div>
                              <p className="text-sm text-muted-foreground mt-1">
                                {u.firstName} {u.lastName}
                              </p>
                            </div>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => setResetPasswordUser(u)}
                              data-testid={`button-reset-password-${u.id}`}
                            >
                              <Key className="w-4 h-4 mr-2" />
                              Redefinir Senha
                            </Button>
                          </div>
                        ))}
                        {allPlatformUsers.length === 0 && (
                          <p className="text-center text-muted-foreground py-4">Nenhum usuario encontrado</p>
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <Dialog open={!!editingPlan} onOpenChange={(open) => !open && setEditingPlan(null)}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Editar Plano: {editingPlan?.name}</DialogTitle>
                <DialogDescription>Atualize as configuracoes deste plano</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Nome</Label>
                    <Input
                      value={planForm.name}
                      onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}
                      data-testid="input-plan-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Preco Mensal (centavos)</Label>
                    <Input
                      type="number"
                      value={planForm.priceMonthly}
                      onChange={(e) => setPlanForm({ ...planForm, priceMonthly: Number(e.target.value) })}
                      data-testid="input-plan-price"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Descricao</Label>
                  <Textarea
                    value={planForm.description}
                    onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })}
                    data-testid="input-plan-description"
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Max Pesquisas</Label>
                    <Input
                      type="number"
                      value={planForm.maxSurveys}
                      onChange={(e) => setPlanForm({ ...planForm, maxSurveys: Number(e.target.value) })}
                      data-testid="input-plan-surveys"
                    />
                    <p className="text-xs text-muted-foreground">-1 para ilimitado</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Max Entrevistas</Label>
                    <Input
                      type="number"
                      value={planForm.maxInterviews}
                      onChange={(e) => setPlanForm({ ...planForm, maxInterviews: Number(e.target.value) })}
                      data-testid="input-plan-interviews"
                    />
                    <p className="text-xs text-muted-foreground">-1 para ilimitado</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Max Usuarios</Label>
                    <Input
                      type="number"
                      value={planForm.maxUsers}
                      onChange={(e) => setPlanForm({ ...planForm, maxUsers: Number(e.target.value) })}
                      data-testid="input-plan-users"
                    />
                    <p className="text-xs text-muted-foreground">-1 para ilimitado</p>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditingPlan(null)}>Cancelar</Button>
                <Button onClick={handleSavePlan} disabled={updatePlan.isPending} data-testid="button-save-plan">
                  {updatePlan.isPending ? "Salvando..." : "Salvar Plano"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={!!resetPasswordUser} onOpenChange={(open) => { if (!open) { setResetPasswordUser(null); setNewPassword(""); } }}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Redefinir Senha</DialogTitle>
                <DialogDescription>Defina uma nova senha para o usuario {resetPasswordUser?.email}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Nova Senha</Label>
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Digite a nova senha (min. 6 caracteres)"
                    data-testid="input-new-password"
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  O usuario podera usar esta senha para acessar a plataforma imediatamente.
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setResetPasswordUser(null); setNewPassword(""); }}>Cancelar</Button>
                <Button 
                  onClick={handleResetPassword} 
                  disabled={resetUserPassword.isPending || newPassword.length < 6}
                  data-testid="button-confirm-reset-password"
                >
                  {resetUserPassword.isPending ? "Salvando..." : "Definir Senha"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <TabsContent value="notifications" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Preferencias de Notificacao</CardTitle>
                <CardDescription>Configure como voce deseja receber alertas</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Alertas por Email</p>
                    <p className="text-sm text-muted-foreground">Receba notificacoes importantes por email</p>
                  </div>
                  <Switch
                    checked={notifications.emailAlerts}
                    onCheckedChange={(v) => setNotifications({ ...notifications, emailAlerts: v })}
                    data-testid="switch-email-alerts"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Alertas de Fraude</p>
                    <p className="text-sm text-muted-foreground">Seja notificado quando entrevistas suspeitas forem detectadas</p>
                  </div>
                  <Switch
                    checked={notifications.fraudAlerts}
                    onCheckedChange={(v) => setNotifications({ ...notifications, fraudAlerts: v })}
                    data-testid="switch-fraud-alerts"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Relatorios Diarios</p>
                    <p className="text-sm text-muted-foreground">Resumo diario das atividades de coleta</p>
                  </div>
                  <Switch
                    checked={notifications.dailyReports}
                    onCheckedChange={(v) => setNotifications({ ...notifications, dailyReports: v })}
                    data-testid="switch-daily-reports"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Relatorios Semanais</p>
                    <p className="text-sm text-muted-foreground">Resumo semanal com metricas e insights</p>
                  </div>
                  <Switch
                    checked={notifications.weeklyReports}
                    onCheckedChange={(v) => setNotifications({ ...notifications, weeklyReports: v })}
                    data-testid="switch-weekly-reports"
                  />
                </div>

                <div className="flex justify-end pt-4 border-t">
                  <Button data-testid="button-save-notifications">
                    <Save className="w-4 h-4 mr-2" /> Salvar Preferencias
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="security" className="mt-6">
            <div className="grid gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Configuracoes de Seguranca</CardTitle>
                  <CardDescription>Proteja sua organizacao e dados</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Autenticacao em Dois Fatores (2FA)</p>
                      <p className="text-sm text-muted-foreground">Exigir 2FA para todos os membros</p>
                    </div>
                    <Switch data-testid="switch-2fa" />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Restricao por IP</p>
                      <p className="text-sm text-muted-foreground">Limitar acesso a IPs autorizados</p>
                    </div>
                    <Switch data-testid="switch-ip-restriction" />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Logs de Auditoria</p>
                      <p className="text-sm text-muted-foreground">Manter historico de acoes por 90 dias</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-500" />
                      <span className="text-sm text-green-600">Ativo</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-destructive/50">
                <CardHeader>
                  <CardTitle className="text-destructive flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5" />
                    Zona de Perigo
                  </CardTitle>
                  <CardDescription>Acoes irreversiveis que afetam toda a organizacao</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Excluir Organizacao</p>
                      <p className="text-sm text-muted-foreground">Remove permanentemente todos os dados</p>
                    </div>
                    <Button variant="destructive" data-testid="button-delete-org">
                      Excluir Organizacao
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Module Create/Edit Dialog */}
      <Dialog open={moduleDialogOpen} onOpenChange={(open) => { if (!open) resetModuleForm(); setModuleDialogOpen(open); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{editingModule ? "Editar Modulo" : "Novo Modulo de Perguntas"}</DialogTitle>
            <DialogDescription>
              Crie um conjunto de perguntas reutilizaveis para agilizar a criacao de pesquisas
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-6 pb-4">
              <div className="space-y-2">
                <Label htmlFor="moduleName">Nome do Modulo</Label>
                <Input
                  id="moduleName"
                  placeholder="Ex: Dados Demograficos"
                  value={moduleForm.name}
                  onChange={(e) => setModuleForm({ ...moduleForm, name: e.target.value })}
                  data-testid="input-module-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="moduleDesc">Descricao (opcional)</Label>
                <Textarea
                  id="moduleDesc"
                  placeholder="Descreva o proposito deste modulo"
                  value={moduleForm.description}
                  onChange={(e) => setModuleForm({ ...moduleForm, description: e.target.value })}
                  data-testid="input-module-description"
                />
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Perguntas</Label>
                  <Button variant="outline" size="sm" onClick={addQuestion} data-testid="button-add-question">
                    <Plus className="w-4 h-4 mr-1" /> Adicionar
                  </Button>
                </div>

                {moduleForm.questions.length === 0 ? (
                  <div className="text-center py-8 border rounded-lg text-muted-foreground">
                    Nenhuma pergunta adicionada. Clique em "Adicionar" para comecar.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {moduleForm.questions.map((q, idx) => (
                      <Card key={idx} data-testid={`card-question-${idx}`}>
                        <CardContent className="pt-4 space-y-4">
                          <div className="flex items-start gap-3">
                            <div className="flex-1 space-y-4">
                              <div className="space-y-2">
                                <Label>Texto da Pergunta</Label>
                                <Input
                                  placeholder="Digite a pergunta"
                                  value={q.text}
                                  onChange={(e) => updateQuestion(idx, "text", e.target.value)}
                                  data-testid={`input-question-text-${idx}`}
                                />
                              </div>
                              <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                  <Label>Tipo</Label>
                                  <Select
                                    value={q.type}
                                    onValueChange={(v) => updateQuestion(idx, "type", v)}
                                  >
                                    <SelectTrigger data-testid={`select-question-type-${idx}`}>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="multiple_choice">Multipla Escolha</SelectItem>
                                      <SelectItem value="text">Texto</SelectItem>
                                      <SelectItem value="number">Numero</SelectItem>
                                      <SelectItem value="rating">Avaliacao</SelectItem>
                                      <SelectItem value="date">Data</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="flex items-end">
                                  <div className="flex items-center gap-2">
                                    <Switch
                                      checked={q.required}
                                      onCheckedChange={(v) => updateQuestion(idx, "required", v)}
                                      data-testid={`switch-question-required-${idx}`}
                                    />
                                    <Label className="text-sm">Obrigatoria</Label>
                                  </div>
                                </div>
                              </div>
                              {q.type === "multiple_choice" && (
                                <div className="space-y-2">
                                  <Label>Opcoes (uma por linha)</Label>
                                  <Textarea
                                    placeholder="Masculino&#10;Feminino&#10;Outro"
                                    value={q.options.join("\n")}
                                    onChange={(e) => updateQuestion(idx, "options", e.target.value.split("\n").filter(Boolean))}
                                    rows={4}
                                    data-testid={`input-question-options-${idx}`}
                                  />
                                </div>
                              )}
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeQuestion(idx)}
                              data-testid={`button-remove-question-${idx}`}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
          <DialogFooter className="pt-4 border-t">
            <Button variant="outline" onClick={() => setModuleDialogOpen(false)} data-testid="button-cancel-module">
              Cancelar
            </Button>
            <Button 
              onClick={handleSaveModule} 
              disabled={createModule.isPending || updateModule.isPending}
              data-testid="button-save-module"
            >
              <Save className="w-4 h-4 mr-2" />
              {createModule.isPending || updateModule.isPending ? "Salvando..." : "Salvar Modulo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteModuleId !== null} onOpenChange={(open) => !open && setDeleteModuleId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir Modulo</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir este modulo? Esta acao nao pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteModuleId(null)} data-testid="button-cancel-delete">
              Cancelar
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => deleteModuleId && deleteModule.mutate(deleteModuleId)}
              disabled={deleteModule.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteModule.isPending ? "Excluindo..." : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
