import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Building2, Users, Plus, Trash2, KeyRound, Search, Building, Shield, Crown, UserCog, Eye, ClipboardList, RefreshCw, ArrowLeft, Globe, Smartphone, Apple, CheckCircle2, XCircle, Loader2, ExternalLink, Settings2, Play } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { useLocation } from "wouter";
import { roleLabels } from "@shared/i18n/labels";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

type Organization = {
  id: number;
  name: string;
  slug: string;
  plan: string;
  memberCount: number;
  ownerEmail: string | null;
  createdAt: string;
};

type UserWithMemberships = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  authProvider: string;
  profileImageUrl: string | null;
  createdAt: string;
  memberships: { organizationId: number; organizationName: string; role: string }[];
};

function usePlatformOrganizations() {
  return useQuery<Organization[]>({
    queryKey: ['/api/platform/organizations'],
    queryFn: async () => {
      const res = await fetch('/api/platform/organizations', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch organizations');
      return res.json();
    }
  });
}

function usePlatformUsers() {
  return useQuery<UserWithMemberships[]>({
    queryKey: ['/api/platform/users'],
    queryFn: async () => {
      const res = await fetch('/api/platform/users', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch users');
      return res.json();
    }
  });
}

const createOrgSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  ownerEmail: z.string().email("Email inválido"),
  planType: z.enum(['basic', 'pro', 'enterprise']).default('basic')
});

function getRoleIcon(role: string) {
  switch (role) {
    case 'owner': return <Crown className="w-3 h-3" />;
    case 'admin': return <Shield className="w-3 h-3" />;
    case 'coordinator': return <UserCog className="w-3 h-3" />;
    case 'interviewer': return <ClipboardList className="w-3 h-3" />;
    case 'viewer': return <Eye className="w-3 h-3" />;
    default: return null;
  }
}

function getRoleBadgeVariant(role: string): "default" | "secondary" | "outline" | "destructive" {
  switch (role) {
    case 'owner': return 'default';
    case 'admin': return 'default';
    default: return 'secondary';
  }
}

function OrganizationsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: organizations, isLoading } = usePlatformOrganizations();
  const [search, setSearch] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const form = useForm<z.infer<typeof createOrgSchema>>({
    resolver: zodResolver(createOrgSchema),
    defaultValues: { name: "", ownerEmail: "", planType: "basic" }
  });

  const createMutation = useMutation({
    mutationFn: async (data: z.infer<typeof createOrgSchema>) => {
      const res = await fetch('/api/platform/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Failed to create organization');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/platform/organizations'] });
      setCreateDialogOpen(false);
      form.reset();
      toast({ title: "Organização criada", description: "A organização foi criada com sucesso." });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Erro", description: "Erro ao criar organização." });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (orgId: number) => {
      const res = await fetch(`/api/platform/organizations/${orgId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Failed to delete organization');
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/platform/organizations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/platform/users'] });
      toast({ title: "Organização excluída", description: data.message });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Erro", description: "Erro ao excluir organização." });
    }
  });

  const filteredOrgs = organizations?.filter(org => 
    org.name.toLowerCase().includes(search.toLowerCase()) ||
    org.ownerEmail?.toLowerCase().includes(search.toLowerCase())
  ) || [];

  const getPlanLabel = (plan: string) => {
    switch (plan) {
      case 'basic': return 'Básico';
      case 'pro': return 'Profissional';
      case 'enterprise': return 'Enterprise';
      default: return plan;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1,2,3].map(i => <Skeleton key={i} className="h-24" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar organizações..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-organizations"
          />
        </div>
        
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-organization">
              <Plus className="w-4 h-4 mr-2" />
              Nova Organização
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar Nova Organização</DialogTitle>
              <DialogDescription>
                Preencha os dados para criar uma nova organização na plataforma.
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((data) => createMutation.mutate(data))} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome da Organização</FormLabel>
                      <FormControl>
                        <Input placeholder="Ex: Instituto ABF" {...field} data-testid="input-org-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="ownerEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email do Proprietário</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="proprietario@exemplo.com" {...field} data-testid="input-owner-email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="planType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Plano</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-plan-type">
                            <SelectValue placeholder="Selecione o plano" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="basic">Básico</SelectItem>
                          <SelectItem value="pro">Profissional</SelectItem>
                          <SelectItem value="enterprise">Enterprise</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-create-org">
                    {createMutation.isPending ? "Criando..." : "Criar Organização"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="text-sm text-muted-foreground">
        {filteredOrgs.length} organização(ões) encontrada(s)
      </div>

      <div className="grid gap-4">
        {filteredOrgs.map(org => (
          <Card key={org.id} data-testid={`card-organization-${org.id}`}>
            <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-primary/10">
                  <Building2 className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-lg">{org.name}</CardTitle>
                  <CardDescription className="flex items-center gap-2 flex-wrap">
                    <span>{org.slug}</span>
                    <Badge variant="outline" className="text-xs">{getPlanLabel(org.plan)}</Badge>
                  </CardDescription>
                </div>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" data-testid={`button-delete-org-${org.id}`}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir Organização</AlertDialogTitle>
                    <AlertDialogDescription>
                      Você tem certeza que deseja excluir permanentemente "{org.name}"? 
                      Esta ação irá remover TODOS os dados: pesquisas, respostas, membros, etc.
                      Esta ação não pode ser desfeita.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => deleteMutation.mutate(org.id)}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      data-testid={`button-confirm-delete-org-${org.id}`}
                    >
                      Excluir Permanentemente
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-muted-foreground" />
                  <span>{org.memberCount} membro(s)</span>
                </div>
                {org.ownerEmail && (
                  <div className="flex items-center gap-2">
                    <Crown className="w-4 h-4 text-amber-500" />
                    <span className="text-muted-foreground">{org.ownerEmail}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function UsersTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: users, isLoading } = usePlatformUsers();
  const [search, setSearch] = useState("");
  const [resetPasswordDialog, setResetPasswordDialog] = useState<UserWithMemberships | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ userId, password }: { userId: string; password: string }) => {
      const res = await fetch(`/api/admin/users/${userId}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Failed to reset password');
      return res.json();
    },
    onSuccess: () => {
      setResetPasswordDialog(null);
      setNewPassword("");
      toast({ title: "Senha redefinida", description: "A senha foi atualizada com sucesso." });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Erro", description: "Erro ao redefinir senha." });
    }
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`/api/platform/users/${userId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Failed to delete user');
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/platform/users'] });
      queryClient.invalidateQueries({ queryKey: ['/api/platform/organizations'] });
      toast({ title: "Usuário excluído", description: data.message });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Erro", description: "Erro ao excluir usuário." });
    }
  });

  const filteredUsers = users?.filter(user => 
    user.email?.toLowerCase().includes(search.toLowerCase()) ||
    user.firstName?.toLowerCase().includes(search.toLowerCase()) ||
    user.lastName?.toLowerCase().includes(search.toLowerCase())
  ) || [];

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-20" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar usuários..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
          data-testid="input-search-users"
        />
      </div>

      <div className="text-sm text-muted-foreground">
        {filteredUsers.length} usuário(s) encontrado(s)
      </div>

      <div className="grid gap-3">
        {filteredUsers.map(user => (
          <Card key={user.id} data-testid={`card-user-${user.id}`}>
            <CardContent className="py-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarImage src={user.profileImageUrl || undefined} />
                    <AvatarFallback>
                      {(user.firstName?.[0] || user.email?.[0] || '?').toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="font-medium">
                      {user.firstName || user.lastName 
                        ? `${user.firstName || ''} ${user.lastName || ''}`.trim()
                        : user.email}
                    </div>
                    <div className="text-sm text-muted-foreground">{user.email}</div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {user.memberships.length === 0 ? (
                        <Badge variant="outline" className="text-xs">Sem organização</Badge>
                      ) : (
                        user.memberships.map((m, idx) => (
                          <Badge key={idx} variant={getRoleBadgeVariant(m.role)} className="text-xs flex items-center gap-1">
                            {getRoleIcon(m.role)}
                            {m.organizationName}: {roleLabels[m.role as keyof typeof roleLabels] || m.role}
                          </Badge>
                        ))
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {user.authProvider === 'password' ? 'Senha' : 
                     user.authProvider === 'replit' ? 'Replit' :
                     user.authProvider === 'pending' ? 'Pendente' : user.authProvider}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setResetPasswordDialog(user);
                      setNewPassword("");
                    }}
                    data-testid={`button-reset-password-${user.id}`}
                  >
                    <KeyRound className="w-4 h-4" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" data-testid={`button-delete-user-${user.id}`}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir Usuário</AlertDialogTitle>
                        <AlertDialogDescription>
                          Você tem certeza que deseja excluir permanentemente "{user.email}"? 
                          O usuário será removido de todas as organizações. Esta ação não pode ser desfeita.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteUserMutation.mutate(user.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          data-testid={`button-confirm-delete-user-${user.id}`}
                        >
                          Excluir Permanentemente
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!resetPasswordDialog} onOpenChange={(open) => !open && setResetPasswordDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redefinir Senha</DialogTitle>
            <DialogDescription>
              Defina uma nova senha para {resetPasswordDialog?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">Nova Senha</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                data-testid="input-new-password"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                if (resetPasswordDialog && newPassword.length >= 6) {
                  resetPasswordMutation.mutate({ userId: resetPasswordDialog.id, password: newPassword });
                }
              }}
              disabled={newPassword.length < 6 || resetPasswordMutation.isPending}
              data-testid="button-submit-reset-password"
            >
              {resetPasswordMutation.isPending ? "Salvando..." : "Redefinir Senha"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type AppStoreConfig = {
  codemagic_api_key: string;
  codemagic_app_id: string;
  android_sha256_fingerprint: string;
  ios_workflow_id: string;
  android_workflow_id: string;
  ios_last_build_id?: string;
  android_last_build_id?: string;
};

type AssetlinksStatus = {
  configured: boolean;
  fingerprint: string | null;
  liveMatch: boolean;
  liveError: string | null;
};

type BuildStatus = {
  buildId: string;
  platform: string;
  status: string;
  startedAt?: string;
  finishedAt?: string;
  workflowId?: string;
};

const buildStatusLabel: Record<string, string> = {
  queued: 'Na fila',
  preparing: 'Preparando',
  building: 'Construindo',
  finishing: 'Finalizando',
  finished: 'Concluído',
  failed: 'Falhou',
  canceled: 'Cancelado',
  skipped: 'Ignorado',
  timeout: 'Tempo esgotado',
};

const buildStatusColor: Record<string, string> = {
  finished: 'text-green-600',
  failed: 'text-red-600',
  canceled: 'text-yellow-600',
  timeout: 'text-red-600',
};

function BuildStatusCard({
  platform,
  buildStatus,
  appId,
  onRefresh,
  isRefreshing,
}: {
  platform: 'ios' | 'android';
  buildStatus: BuildStatus | null;
  appId: string;
  onRefresh: () => void;
  isRefreshing: boolean;
}) {
  if (!buildStatus) return null;
  return (
    <div className="rounded-md border p-3 space-y-2 bg-muted/40" data-testid={`card-build-status-${platform}`}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Último Build</p>
        <Button variant="ghost" size="sm" onClick={onRefresh} disabled={isRefreshing}
          data-testid={`button-check-build-status-${platform}`}>
          {isRefreshing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground font-mono">ID: {buildStatus.buildId}</p>
      {buildStatus.status && (
        <p className={`text-sm font-medium ${buildStatusColor[buildStatus.status] || 'text-muted-foreground'}`}>
          Status: {buildStatusLabel[buildStatus.status] || buildStatus.status}
        </p>
      )}
      {buildStatus.finishedAt && (
        <p className="text-xs text-muted-foreground">
          Concluído em: {new Date(buildStatus.finishedAt).toLocaleString('pt-BR')}
        </p>
      )}
      {appId && buildStatus.buildId && (
        <a href={`https://codemagic.io/app/${appId}/build/${buildStatus.buildId}`}
          target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          data-testid={`link-codemagic-build-${platform}`}>
          <ExternalLink className="w-3 h-3" />
          Ver no Codemagic
        </a>
      )}
    </div>
  );
}

function AppStoresTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Config form state — only set when user wants to change a value
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [appIdInput, setAppIdInput] = useState('');
  const [sha256Input, setSha256Input] = useState('');
  const [iosWorkflowInput, setIosWorkflowInput] = useState('');
  const [androidWorkflowInput, setAndroidWorkflowInput] = useState('');

  // Per-platform build status
  const [iosBuildStatus, setIosBuildStatus] = useState<BuildStatus | null>(null);
  const [androidBuildStatus, setAndroidBuildStatus] = useState<BuildStatus | null>(null);
  const [checkingIos, setCheckingIos] = useState(false);
  const [checkingAndroid, setCheckingAndroid] = useState(false);

  const { data: config, isLoading: configLoading } = useQuery<AppStoreConfig>({
    queryKey: ['/api/admin/app-store/config'],
    queryFn: async () => {
      const res = await fetch('/api/admin/app-store/config', { credentials: 'include' });
      if (!res.ok) throw new Error('Erro ao buscar configurações');
      return res.json();
    },
  });

  const { data: assetlinks } = useQuery<AssetlinksStatus>({
    queryKey: ['/api/admin/app-store/verify-assetlinks'],
    queryFn: async () => {
      const res = await fetch('/api/admin/app-store/verify-assetlinks', { credentials: 'include' });
      if (!res.ok) throw new Error();
      return res.json();
    },
  });

  const saveConfigMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, string> = {};
      if (apiKeyInput) body.codemagic_api_key = apiKeyInput;
      if (appIdInput) body.codemagic_app_id = appIdInput;
      if (sha256Input) body.android_sha256_fingerprint = sha256Input;
      if (iosWorkflowInput) body.ios_workflow_id = iosWorkflowInput;
      if (androidWorkflowInput) body.android_workflow_id = androidWorkflowInput;
      const res = await fetch('/api/admin/app-store/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include',
      });
      if (!res.ok) throw new Error((await res.json()).message || 'Erro ao salvar');
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Configurações salvas com sucesso' });
      setApiKeyInput('');
      queryClient.invalidateQueries({ queryKey: ['/api/admin/app-store/config'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/app-store/verify-assetlinks'] });
    },
    onError: (err: Error) => toast({ title: err.message, variant: 'destructive' }),
  });

  const triggerBuildMutation = useMutation({
    mutationFn: async (platform: 'ios-app-store' | 'ios-development' | 'android-twa') => {
      const res = await fetch('/api/admin/app-store/trigger-build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform }),
        credentials: 'include',
      });
      if (!res.ok) throw new Error((await res.json()).message || 'Erro ao disparar build');
      return res.json() as Promise<{ buildId: string; platform: string; buildUrl: string }>;
    },
    onSuccess: (data) => {
      const isAndroid = data.platform === 'android-twa';
      toast({
        title: `Build ${isAndroid ? 'Android' : 'iOS'} disparado!`,
        description: `Build ID: ${data.buildId}`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/app-store/config'] });
      const status: BuildStatus = { buildId: data.buildId, platform: data.platform, status: 'queued' };
      if (isAndroid) setAndroidBuildStatus(status);
      else setIosBuildStatus(status);
    },
    onError: (err: Error) => toast({ title: err.message, variant: 'destructive' }),
  });

  const checkBuildStatus = async (platform: 'ios' | 'android') => {
    const setChecking = platform === 'ios' ? setCheckingIos : setCheckingAndroid;
    const setStatus = platform === 'ios' ? setIosBuildStatus : setAndroidBuildStatus;
    setChecking(true);
    try {
      const res = await fetch(`/api/admin/app-store/build-status/${platform}`, { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Erro ao consultar status');
      setStatus(data);
    } catch (err: any) {
      toast({ title: err.message, variant: 'destructive' });
    } finally {
      setChecking(false);
    }
  };

  const canTrigger = !!(config?.codemagic_api_key && config?.codemagic_app_id);

  return (
    <div className="space-y-6">
      {/* Config card */}
      <Card data-testid="card-app-store-config">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-primary" />
            <CardTitle>Configurações de CI/CD</CardTitle>
          </div>
          <CardDescription>
            Credenciais para integração com o Codemagic (iOS e Android) e verificação do TWA Android.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {configLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="input-codemagic-api-key">Codemagic API Key</Label>
                <Input
                  id="input-codemagic-api-key"
                  data-testid="input-codemagic-api-key"
                  type="password"
                  placeholder={config?.codemagic_api_key || 'Cole sua API Key do Codemagic'}
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                />
                {config?.codemagic_api_key && (
                  <p className="text-xs text-muted-foreground">
                    Chave atual: {config.codemagic_api_key} — deixe em branco para manter
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="input-codemagic-app-id">Codemagic App ID</Label>
                <Input
                  id="input-codemagic-app-id"
                  data-testid="input-codemagic-app-id"
                  placeholder="Ex: 6123abc456def789..."
                  value={appIdInput || config?.codemagic_app_id || ''}
                  onChange={(e) => setAppIdInput(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Encontrado em Codemagic → App Settings → App ID
                </p>
              </div>
              <Separator />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="input-ios-workflow">Workflow ID iOS</Label>
                  <Input
                    id="input-ios-workflow"
                    data-testid="input-ios-workflow-id"
                    placeholder="ios-app-store"
                    value={iosWorkflowInput || config?.ios_workflow_id || ''}
                    onChange={(e) => setIosWorkflowInput(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Padrão: ios-app-store</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="input-android-workflow">Workflow ID Android</Label>
                  <Input
                    id="input-android-workflow"
                    data-testid="input-android-workflow-id"
                    placeholder="android-twa"
                    value={androidWorkflowInput || config?.android_workflow_id || ''}
                    onChange={(e) => setAndroidWorkflowInput(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Padrão: android-twa</p>
                </div>
              </div>
              <Separator />
              <div className="space-y-2">
                <Label htmlFor="input-sha256">SHA-256 do Certificado Android</Label>
                <Input
                  id="input-sha256"
                  data-testid="input-sha256-fingerprint"
                  placeholder="AB:CD:EF:12:..."
                  value={sha256Input || config?.android_sha256_fingerprint || ''}
                  onChange={(e) => setSha256Input(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Fingerprint SHA-256 do certificado de assinatura do Play Store (alimenta o assetlinks.json)
                </p>
              </div>
            </>
          )}
        </CardContent>
        <CardFooter>
          <Button
            data-testid="button-save-app-store-config"
            onClick={() => saveConfigMutation.mutate()}
            disabled={saveConfigMutation.isPending}
          >
            {saveConfigMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Salvar Configurações
          </Button>
        </CardFooter>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* iOS Card */}
        <Card data-testid="card-ios-builds">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Apple className="w-5 h-5" />
              <CardTitle>iOS (TestFlight)</CardTitle>
            </div>
            <CardDescription>
              Dispara builds iOS via Codemagic. O workflow envia o app ao TestFlight automaticamente.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-2">
              <Button
                data-testid="button-trigger-ios-appstore"
                onClick={() => triggerBuildMutation.mutate('ios-app-store')}
                disabled={triggerBuildMutation.isPending || !canTrigger}
                className="w-full"
              >
                {triggerBuildMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                Disparar Build → TestFlight
              </Button>
              <Button
                variant="outline"
                data-testid="button-trigger-ios-dev"
                onClick={() => triggerBuildMutation.mutate('ios-development')}
                disabled={triggerBuildMutation.isPending || !canTrigger}
                className="w-full"
              >
                {triggerBuildMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                Disparar Build de Desenvolvimento
              </Button>
            </div>
            {!canTrigger && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Configure API Key e App ID do Codemagic para habilitar os builds.
              </p>
            )}
            <BuildStatusCard
              platform="ios"
              buildStatus={iosBuildStatus}
              appId={config?.codemagic_app_id || ''}
              onRefresh={() => checkBuildStatus('ios')}
              isRefreshing={checkingIos}
            />
            {!iosBuildStatus && config?.ios_last_build_id && (
              <Button variant="ghost" size="sm" onClick={() => checkBuildStatus('ios')} disabled={checkingIos}
                data-testid="button-load-ios-build-status" className="w-full text-xs">
                {checkingIos ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
                Carregar status do último build iOS
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Android Card */}
        <Card data-testid="card-android-twa">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-green-600" />
              <CardTitle>Android (TWA / Google Play)</CardTitle>
            </div>
            <CardDescription>
              Dispara builds Android TWA via Codemagic e verifica o assetlinks.json para o Google Play.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              data-testid="button-trigger-android-twa"
              onClick={() => triggerBuildMutation.mutate('android-twa')}
              disabled={triggerBuildMutation.isPending || !canTrigger}
              className="w-full"
            >
              {triggerBuildMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
              Disparar Build Android TWA
            </Button>
            {!canTrigger && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Configure API Key e App ID do Codemagic para habilitar os builds.
              </p>
            )}
            <BuildStatusCard
              platform="android"
              buildStatus={androidBuildStatus}
              appId={config?.codemagic_app_id || ''}
              onRefresh={() => checkBuildStatus('android')}
              isRefreshing={checkingAndroid}
            />
            {!androidBuildStatus && config?.android_last_build_id && (
              <Button variant="ghost" size="sm" onClick={() => checkBuildStatus('android')} disabled={checkingAndroid}
                data-testid="button-load-android-build-status" className="w-full text-xs">
                {checkingAndroid ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
                Carregar status do último build Android
              </Button>
            )}

            {/* Assetlinks verification */}
            <div className="rounded-md border p-3 space-y-3 bg-muted/40">
              <p className="text-sm font-medium">Verificação do assetlinks.json</p>
              <div className="flex items-center gap-2">
                {assetlinks?.configured && assetlinks?.liveMatch ? (
                  <CheckCircle2 className="w-4 h-4 text-green-600" data-testid="icon-assetlinks-ok" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-500" data-testid="icon-assetlinks-missing" />
                )}
                <span className="text-sm">
                  {assetlinks?.configured && assetlinks?.liveMatch
                    ? 'SHA-256 configurado e verificado no endpoint'
                    : assetlinks?.configured
                    ? 'SHA-256 configurado, mas não encontrado no endpoint'
                    : 'SHA-256 não configurado — TWA não verificado'}
                </span>
              </div>
              {assetlinks?.liveError && (
                <p className="text-xs text-red-500">Erro na verificação live: {assetlinks.liveError}</p>
              )}
              {assetlinks?.fingerprint && (
                <p className="text-xs font-mono text-muted-foreground break-all">{assetlinks.fingerprint}</p>
              )}
            </div>

            <div className="flex gap-2 flex-wrap">
              <a href="https://play.google.com/console" target="_blank" rel="noopener noreferrer"
                data-testid="link-play-console">
                <Button variant="outline" size="sm">
                  <ExternalLink className="w-3 h-3 mr-2" />
                  Google Play Console
                </Button>
              </a>
              <a href={`${window.location.origin}/.well-known/assetlinks.json`}
                target="_blank" rel="noopener noreferrer" data-testid="link-assetlinks">
                <Button variant="outline" size="sm">
                  <ExternalLink className="w-3 h-3 mr-2" />
                  Ver assetlinks.json
                </Button>
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function PlatformAdminPage() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/")} data-testid="button-back-dashboard">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="p-2 rounded-md bg-primary/10">
            <Shield className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Painel Super Admin</h1>
        </div>
        <p className="text-muted-foreground">
          Gerencie todas as organizações e usuários da plataforma Data Veracity.
        </p>
      </div>

      <Tabs defaultValue="organizations" className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <TabsList>
            <TabsTrigger value="organizations" className="flex items-center gap-2" data-testid="tab-organizations">
              <Building className="w-4 h-4" />
              Organizações
            </TabsTrigger>
            <TabsTrigger value="users" className="flex items-center gap-2" data-testid="tab-users">
              <Users className="w-4 h-4" />
              Usuários
            </TabsTrigger>
            <TabsTrigger value="lojas" className="flex items-center gap-2" data-testid="tab-lojas">
              <Smartphone className="w-4 h-4" />
              Lojas
            </TabsTrigger>
          </TabsList>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocation("/platform/landing")}
              data-testid="button-edit-landing"
            >
              <Globe className="w-4 h-4 mr-2" />
              Editar Landing Page
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                queryClient.invalidateQueries({ queryKey: ['/api/platform/organizations'] });
                queryClient.invalidateQueries({ queryKey: ['/api/platform/users'] });
              }}
              data-testid="button-refresh-data"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Atualizar
            </Button>
          </div>
        </div>

        <TabsContent value="organizations">
          <OrganizationsTab />
        </TabsContent>
        <TabsContent value="users">
          <UsersTab />
        </TabsContent>
        <TabsContent value="lojas">
          <AppStoresTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
