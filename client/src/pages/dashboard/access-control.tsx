import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useCurrentMember } from "@/hooks/use-organizations";
import { hasPermission, type UserRole } from "@shared/rbac";
import { Shield, Users, History, Plus, Trash2, Check, X, Clock, AlertTriangle } from "lucide-react";
import type { Member, User, MemberPermissionOverride, AccessAuditLog } from "@shared/schema";

const roleLabels: Record<string, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  coordinator: "Coordenador",
  interviewer: "Entrevistador",
  viewer: "Visualizador"
};

const permissionLabels: Record<string, string> = {
  "org:view": "Ver organização",
  "org:edit": "Editar organização",
  "org:delete": "Excluir organização",
  "org:manage_billing": "Gerenciar faturamento",
  "org:manage_branding": "Gerenciar marca",
  "members:view": "Ver membros",
  "members:invite": "Convidar membros",
  "members:edit_role": "Editar funções",
  "members:remove": "Remover membros",
  "surveys:view": "Ver pesquisas",
  "surveys:view_assigned": "Ver pesquisas atribuídas",
  "surveys:create": "Criar pesquisas",
  "surveys:edit": "Editar pesquisas",
  "surveys:delete": "Excluir pesquisas",
  "surveys:publish": "Publicar pesquisas",
  "responses:view": "Ver respostas",
  "responses:view_own": "Ver próprias respostas",
  "responses:submit": "Enviar respostas",
  "responses:audit": "Auditar respostas",
  "responses:invalidate": "Invalidar respostas",
  "analytics:view": "Ver analytics completo",
  "analytics:view_aggregate": "Ver analytics agregado",
  "audio:listen": "Ouvir áudios",
  "gps:view": "Ver GPS",
  "audit_logs:view": "Ver logs de auditoria"
};

const actionLabels: Record<string, string> = {
  "view_survey": "Visualizou pesquisa",
  "view_results": "Visualizou resultados",
  "view_analytics": "Visualizou analytics",
  "download_report": "Baixou relatório",
  "login": "Login",
  "logout": "Logout"
};

interface RoleMatrix {
  roles: string[];
  permissions: string[];
  matrix: Array<{
    role: string;
    permissions: Array<{ permission: string; allowed: boolean }>;
  }>;
}

interface OverrideWithMember extends MemberPermissionOverride {
  member: Member & { user: User };
}

interface AuditLogWithUser extends AccessAuditLog {
  user: User;
}

function RoleMatrixTab({ orgId }: { orgId: number }) {
  const { data: matrix, isLoading } = useQuery<RoleMatrix>({
    queryKey: ['/api/organizations', orgId, 'access', 'roles'],
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!matrix) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold">Matriz de Permissões</h3>
          <p className="text-sm text-muted-foreground">
            Visualize as permissões padrão de cada função no sistema.
          </p>
        </div>
      </div>

      <Card>
        <ScrollArea className="w-full">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 bg-background z-10 min-w-[200px]">
                  Permissão
                </TableHead>
                {matrix.roles.map(role => (
                  <TableHead key={role} className="text-center min-w-[100px]">
                    <Badge variant="outline">{roleLabels[role]}</Badge>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {matrix.permissions.map(perm => (
                <TableRow key={perm}>
                  <TableCell className="sticky left-0 bg-background font-medium">
                    {permissionLabels[perm] || perm}
                  </TableCell>
                  {matrix.matrix.map(roleData => {
                    const permData = roleData.permissions.find(p => p.permission === perm);
                    return (
                      <TableCell key={roleData.role} className="text-center">
                        {permData?.allowed ? (
                          <Check className="h-4 w-4 text-green-600 mx-auto" />
                        ) : (
                          <X className="h-4 w-4 text-muted-foreground mx-auto" />
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </Card>
    </div>
  );
}

function OverridesTab({ orgId }: { orgId: number }) {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string>("");
  const [selectedPermission, setSelectedPermission] = useState<string>("");
  const [isAllowed, setIsAllowed] = useState(true);
  const [reason, setReason] = useState("");

  const { data: overrides, isLoading } = useQuery<OverrideWithMember[]>({
    queryKey: ['/api/organizations', orgId, 'access', 'overrides'],
  });

  const { data: members } = useQuery<(Member & { user: User })[]>({
    queryKey: ['/api/organizations', orgId, 'members'],
  });

  const { data: matrix } = useQuery<RoleMatrix>({
    queryKey: ['/api/organizations', orgId, 'access', 'roles'],
  });

  const addOverrideMutation = useMutation({
    mutationFn: async (data: { memberId: number; permission: string; allowed: boolean; reason: string }) => {
      return await apiRequest("POST", `/api/organizations/${orgId}/access/overrides`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', orgId, 'access', 'overrides'] });
      toast({ title: "Permissão especial adicionada" });
      setIsDialogOpen(false);
      resetForm();
    },
    onError: () => {
      toast({ title: "Erro ao adicionar permissão", variant: "destructive" });
    }
  });

  const removeOverrideMutation = useMutation({
    mutationFn: async (overrideId: number) => {
      return await apiRequest("DELETE", `/api/organizations/${orgId}/access/overrides/${overrideId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', orgId, 'access', 'overrides'] });
      toast({ title: "Permissão especial removida" });
    },
    onError: () => {
      toast({ title: "Erro ao remover permissão", variant: "destructive" });
    }
  });

  const resetForm = () => {
    setSelectedMemberId("");
    setSelectedPermission("");
    setIsAllowed(true);
    setReason("");
  };

  const handleAddOverride = () => {
    if (!selectedMemberId || !selectedPermission) return;
    addOverrideMutation.mutate({
      memberId: parseInt(selectedMemberId),
      permission: selectedPermission,
      allowed: isAllowed,
      reason
    });
  };

  if (isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold">Permissões Especiais</h3>
          <p className="text-sm text-muted-foreground">
            Configure exceções de permissão para membros específicos.
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-override">
              <Plus className="h-4 w-4 mr-1" />
              Adicionar Exceção
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar Permissão Especial</DialogTitle>
              <DialogDescription>
                Configure uma exceção de permissão para um membro específico.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Membro</Label>
                <Select value={selectedMemberId} onValueChange={setSelectedMemberId}>
                  <SelectTrigger data-testid="select-member">
                    <SelectValue placeholder="Selecione um membro" />
                  </SelectTrigger>
                  <SelectContent>
                    {members?.map(m => (
                      <SelectItem key={m.id} value={m.id.toString()}>
                        {m.user.firstName} {m.user.lastName} ({roleLabels[m.role]})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Permissão</Label>
                <Select value={selectedPermission} onValueChange={setSelectedPermission}>
                  <SelectTrigger data-testid="select-permission">
                    <SelectValue placeholder="Selecione uma permissão" />
                  </SelectTrigger>
                  <SelectContent>
                    {matrix?.permissions.map(perm => (
                      <SelectItem key={perm} value={perm}>
                        {permissionLabels[perm] || perm}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <Label>Permitir esta ação</Label>
                <Switch checked={isAllowed} onCheckedChange={setIsAllowed} data-testid="switch-allowed" />
              </div>

              <div className="space-y-2">
                <Label>Motivo (opcional)</Label>
                <Textarea 
                  value={reason} 
                  onChange={e => setReason(e.target.value)}
                  placeholder="Descreva o motivo desta exceção..."
                  data-testid="input-reason"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={handleAddOverride} 
                disabled={!selectedMemberId || !selectedPermission || addOverrideMutation.isPending}
                data-testid="button-confirm-override"
              >
                Adicionar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {overrides && overrides.length > 0 ? (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Membro</TableHead>
                <TableHead>Função Base</TableHead>
                <TableHead>Permissão</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {overrides.map(override => (
                <TableRow key={override.id}>
                  <TableCell className="font-medium">
                    {override.member.user.firstName} {override.member.user.lastName}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{roleLabels[override.member.role]}</Badge>
                  </TableCell>
                  <TableCell>{permissionLabels[override.permission] || override.permission}</TableCell>
                  <TableCell>
                    {override.allowed ? (
                      <Badge variant="default" className="bg-green-600">
                        <Check className="h-3 w-3 mr-1" />
                        Permitido
                      </Badge>
                    ) : (
                      <Badge variant="destructive">
                        <X className="h-3 w-3 mr-1" />
                        Negado
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">
                    {override.reason || "—"}
                  </TableCell>
                  <TableCell>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => removeOverrideMutation.mutate(override.id)}
                      disabled={removeOverrideMutation.isPending}
                      data-testid={`button-remove-override-${override.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <Card className="py-12 text-center">
          <CardContent>
            <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Nenhuma exceção configurada</h3>
            <p className="text-muted-foreground">
              Todas as permissões seguem as funções padrão do sistema.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AuditLogsTab({ orgId }: { orgId: number }) {
  const { data: logs, isLoading } = useQuery<AuditLogWithUser[]>({
    queryKey: ['/api/organizations', orgId, 'access', 'logs'],
  });

  if (isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Histórico de Acessos</h3>
        <p className="text-sm text-muted-foreground">
          Registro de todas as ações realizadas na organização.
        </p>
      </div>

      {logs && logs.length > 0 ? (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data/Hora</TableHead>
                <TableHead>Usuário</TableHead>
                <TableHead>Ação</TableHead>
                <TableHead>Recurso</TableHead>
                <TableHead>Detalhes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map(log => (
                <TableRow key={log.id}>
                  <TableCell className="text-muted-foreground">
                    {log.createdAt ? new Date(log.createdAt).toLocaleString('pt-BR') : "—"}
                  </TableCell>
                  <TableCell className="font-medium">
                    {log.user.firstName} {log.user.lastName}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {actionLabels[log.action] || log.action}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {log.resourceType}
                    {log.resourceId && <span className="text-muted-foreground"> #{log.resourceId}</span>}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                    {log.details ? JSON.stringify(log.details) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <Card className="py-12 text-center">
          <CardContent>
            <History className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Nenhum registro ainda</h3>
            <p className="text-muted-foreground">
              O histórico de acessos aparecerá aqui conforme os usuários interagem com o sistema.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function AccessControlPage({ params }: { params: { orgId: string } }) {
  const orgId = parseInt(params.orgId);
  const { data: currentMember } = useCurrentMember(orgId);
  const userRole = (currentMember?.role as UserRole) || 'viewer';

  const canManagePermissions = hasPermission(userRole, 'members:edit_role');
  const canViewAuditLogs = hasPermission(userRole, 'audit_logs:view');

  return (
    <DashboardLayout orgId={params.orgId}>
      <div className="p-6 space-y-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold" data-testid="text-page-title">
            Controle de Acesso
          </h1>
          <p className="text-muted-foreground">
            Gerencie funções, permissões e monitore acessos da sua organização.
          </p>
        </div>

        <Tabs defaultValue="matrix" className="space-y-4">
          <TabsList>
            <TabsTrigger value="matrix" data-testid="tab-matrix">
              <Shield className="h-4 w-4 mr-1" />
              Matriz de Funções
            </TabsTrigger>
            {canManagePermissions && (
              <TabsTrigger value="overrides" data-testid="tab-overrides">
                <Users className="h-4 w-4 mr-1" />
                Exceções
              </TabsTrigger>
            )}
            {canViewAuditLogs && (
              <TabsTrigger value="logs" data-testid="tab-logs">
                <History className="h-4 w-4 mr-1" />
                Histórico
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="matrix">
            <RoleMatrixTab orgId={orgId} />
          </TabsContent>

          {canManagePermissions && (
            <TabsContent value="overrides">
              <OverridesTab orgId={orgId} />
            </TabsContent>
          )}

          {canViewAuditLogs && (
            <TabsContent value="logs">
              <AuditLogsTab orgId={orgId} />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
