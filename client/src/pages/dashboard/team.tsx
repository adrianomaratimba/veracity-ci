import { useOrganization, useOrganizationMembers, useCurrentMember, useInviteMember, useUpdateMemberRole, useRemoveMember } from "@/hooks/use-organizations";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Users, Shield, MoreVertical, UserPlus, Trash2, UserCog } from "lucide-react";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { userRoleEnum } from "@shared/schema";
import { getRoleLabel, roleOptions } from "@shared/i18n/labels";
import { z } from "zod";

export default function TeamPage({ params }: { params: { orgId: string } }) {
  const orgId = parseInt(params.orgId);
  const { data: org, isLoading: orgLoading } = useOrganization(orgId);
  const { data: members, isLoading: membersLoading } = useOrganizationMembers(orgId);
  const { data: currentMember, isLoading: currentMemberLoading } = useCurrentMember(orgId);
  const inviteMember = useInviteMember();
  const updateMemberRole = useUpdateMemberRole();
  const removeMember = useRemoveMember();
  const { toast } = useToast();

  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    email: "",
    role: "interviewer" as z.infer<typeof userRoleEnum>
  });

  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<{ id: number; role: string; name: string } | null>(null);
  const [newRole, setNewRole] = useState<z.infer<typeof userRoleEnum>>("viewer");

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [memberToDelete, setMemberToDelete] = useState<{ id: number; name: string } | null>(null);

  if (orgLoading || membersLoading || currentMemberLoading) return <LoadingScreen message="Carregando equipe..." />;
  if (!org) return <div>Organização não encontrada</div>;

  const isOwner = currentMember?.role === 'owner';
  const isAdmin = currentMember?.role === 'admin';
  const canManageMembers = isOwner || isAdmin;

  // Determine which roles the current user can manage
  const getManageableRoles = () => {
    if (isOwner) return ['admin', 'coordinator', 'interviewer', 'viewer'];
    if (isAdmin) return ['coordinator', 'interviewer', 'viewer'];
    return [];
  };

  // Check if current user can manage a specific member
  const canManageMember = (memberRole: string) => {
    if (isOwner) return memberRole !== 'owner';
    if (isAdmin) return ['coordinator', 'interviewer', 'viewer'].includes(memberRole);
    return false;
  };

  const manageableRoles = getManageableRoles();

  const handleInvite = async () => {
    if (!inviteForm.email.trim()) {
      toast({ title: "Erro", description: "O email é obrigatório", variant: "destructive" });
      return;
    }
    try {
      await inviteMember.mutateAsync({
        orgId,
        email: inviteForm.email,
        role: inviteForm.role
      });
      toast({ title: "Membro adicionado", description: `${inviteForm.email} foi adicionado à equipe` });
      setIsInviteOpen(false);
      setInviteForm({ email: "", role: "interviewer" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao adicionar membro";
      toast({ title: "Erro", description: message, variant: "destructive" });
    }
  };

  const handleUpdateRole = async () => {
    if (!selectedMember) return;
    try {
      await updateMemberRole.mutateAsync({
        memberId: selectedMember.id,
        role: newRole,
        orgId
      });
      toast({ title: "Função atualizada", description: `${selectedMember.name} agora é ${getRoleLabel(newRole)}` });
      setRoleDialogOpen(false);
      setSelectedMember(null);
    } catch (error) {
      toast({ title: "Erro", description: "Falha ao atualizar função", variant: "destructive" });
    }
  };

  const handleRemoveMember = async () => {
    if (!memberToDelete) return;
    try {
      await removeMember.mutateAsync({
        memberId: memberToDelete.id,
        orgId
      });
      toast({ title: "Membro removido", description: `${memberToDelete.name} foi removido da equipe` });
      setDeleteDialogOpen(false);
      setMemberToDelete(null);
    } catch (error) {
      toast({ title: "Erro", description: "Falha ao remover membro", variant: "destructive" });
    }
  };

  const getRoleBadgeVariant = (role: string): "default" | "secondary" | "outline" => {
    if (role === 'owner' || role === 'admin') return 'default';
    if (role === 'coordinator' || role === 'interviewer') return 'secondary';
    return 'outline';
  };

  // Role options for inviting - filter based on current user's permissions
  const inviteRoleOptions = roleOptions.filter(r => manageableRoles.includes(r.value));

  return (
    <DashboardLayout orgId={params.orgId}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold">Equipe</h1>
            <p className="text-muted-foreground">Gerencie os membros da sua organização</p>
          </div>
          {canManageMembers && (
            <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2" data-testid="button-invite-member">
                  <UserPlus className="w-4 h-4" /> Adicionar Membro
                </Button>
              </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Adicionar Novo Membro</DialogTitle>
                <DialogDescription>Adicione um novo membro diretamente à equipe. Se o email não estiver cadastrado, uma conta será criada automaticamente.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="email@exemplo.com"
                    value={inviteForm.email}
                    onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                    data-testid="input-invite-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Função</Label>
                  <Select value={inviteForm.role} onValueChange={(v) => setInviteForm({ ...inviteForm, role: v as z.infer<typeof userRoleEnum> })}>
                    <SelectTrigger data-testid="select-invite-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {inviteRoleOptions.map(r => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsInviteOpen(false)}>Cancelar</Button>
                <Button onClick={handleInvite} disabled={inviteMember.isPending} data-testid="button-send-invite">
                  {inviteMember.isPending ? "Adicionando..." : "Adicionar"}
                </Button>
              </DialogFooter>
            </DialogContent>
            </Dialog>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Users className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold" data-testid="text-total-members">{members?.length || 0}</p>
                  <p className="text-xs text-muted-foreground">Total de Membros</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                  <Shield className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold" data-testid="text-admin-count">{members?.filter(m => m.role === 'admin' || m.role === 'owner').length || 0}</p>
                  <p className="text-xs text-muted-foreground">Administradores</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold" data-testid="text-coordinator-count">{members?.filter(m => m.role === 'coordinator').length || 0}</p>
                  <p className="text-xs text-muted-foreground">Coordenadores</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                  <Users className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold" data-testid="text-interviewer-count">{members?.filter(m => m.role === 'interviewer').length || 0}</p>
                  <p className="text-xs text-muted-foreground">Entrevistadores</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Membros da Equipe</CardTitle>
            <CardDescription>Lista de todos os membros com acesso à organização</CardDescription>
          </CardHeader>
          <CardContent>
            {members && members.length > 0 ? (
              <div className="divide-y">
                {members.map((member, index) => (
                  <div key={member.id} className="py-4 flex items-center justify-between gap-4" data-testid={`row-member-${index}`}>
                    <div className="flex items-center gap-4">
                      <Avatar>
                        <AvatarImage src={member.user?.profileImageUrl || undefined} />
                        <AvatarFallback>
                          {member.user?.firstName?.[0]}{member.user?.lastName?.[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">
                          {member.user?.firstName} {member.user?.lastName}
                        </p>
                        <p className="text-sm text-muted-foreground">{member.user?.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={getRoleBadgeVariant(member.role)}>{getRoleLabel(member.role)}</Badge>
                      {canManageMember(member.role) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" data-testid={`button-member-menu-${index}`}>
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => {
                              const name = `${member.user?.firstName || ''} ${member.user?.lastName || ''}`.trim();
                              setSelectedMember({ id: member.id, role: member.role, name });
                              setNewRole(member.role as z.infer<typeof userRoleEnum>);
                              setRoleDialogOpen(true);
                            }}>
                              <UserCog className="w-4 h-4 mr-2" />
                              Alterar Função
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              className="text-destructive"
                              onClick={() => {
                                const name = `${member.user?.firstName || ''} ${member.user?.lastName || ''}`.trim();
                                setMemberToDelete({ id: member.id, name });
                                setDeleteDialogOpen(true);
                              }}
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Remover
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum membro na equipe ainda.</p>
                <p className="text-sm">Convide membros para começar a colaborar.</p>
              </div>
            )}
          </CardContent>
        </Card>

      </div>

      <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar Função</DialogTitle>
            <DialogDescription>
              Altere a função de {selectedMember?.name} na organização
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="newRole">Nova Função</Label>
            <Select value={newRole} onValueChange={(v) => setNewRole(v as z.infer<typeof userRoleEnum>)}>
              <SelectTrigger className="mt-2" data-testid="select-new-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {inviteRoleOptions.map(r => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleUpdateRole} disabled={updateMemberRole.isPending} data-testid="button-confirm-role">
              {updateMemberRole.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover Membro</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover {memberToDelete?.name} da equipe? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleRemoveMember}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-delete"
            >
              {removeMember.isPending ? "Removendo..." : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </DashboardLayout>
  );
}
