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
import { Building2, Users, Plus, Trash2, KeyRound, Search, Building, Shield, Crown, UserCog, Eye, ClipboardList, RefreshCw, ArrowLeft, Globe } from "lucide-react";
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
      </Tabs>
    </div>
  );
}
