import { useOrganization, useOrganizationMembers, useCurrentMember, useInviteMember, useUpdateMemberRole, useRemoveMember, useSetMemberPassword, useUpdateMemberName } from "@/hooks/use-organizations";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Users, Shield, MoreVertical, UserPlus, Trash2, UserCog, KeyRound, Eye, EyeOff, Pencil } from "lucide-react";
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
  const setMemberPassword = useSetMemberPassword();
  const updateMemberName = useUpdateMemberName();
  const { toast } = useToast();

  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    email: "",
    role: "interviewer" as z.infer<typeof userRoleEnum>,
    password: ""
  });
  const [showInvitePassword, setShowInvitePassword] = useState(false);

  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<{ id: number; role: string; name: string } | null>(null);
  const [newRole, setNewRole] = useState<z.infer<typeof userRoleEnum>>("viewer");

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [memberToDelete, setMemberToDelete] = useState<{ id: number; name: string } | null>(null);
  const [setupLinkDialog, setSetupLinkDialog] = useState<{ open: boolean; email: string; link: string | null }>({ open: false, email: "", link: null });

  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [passwordMember, setPasswordMember] = useState<{ id: number; name: string } | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);

  const [nameDialogOpen, setNameDialogOpen] = useState(false);
  const [nameMember, setNameMember] = useState<{ id: number; firstName: string; lastName: string } | null>(null);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");

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
    if (inviteForm.password && inviteForm.password.length < 6) {
      toast({ title: "Erro", description: "A senha deve ter pelo menos 6 caracteres", variant: "destructive" });
      return;
    }
    try {
      const result = await inviteMember.mutateAsync({
        orgId,
        email: inviteForm.email,
        role: inviteForm.role,
        password: inviteForm.password || undefined
      });
      
      setIsInviteOpen(false);
      const email = inviteForm.email;
      const hadPassword = !!inviteForm.password;
      setInviteForm({ email: "", role: "interviewer", password: "" });
      setShowInvitePassword(false);
      
      // Show setup link dialog if user needs to set password (only if no password was provided)
      if (result.setupLink && !hadPassword) {
        setSetupLinkDialog({ open: true, email, link: result.setupLink });
      } else if (hadPassword) {
        toast({ title: "Membro adicionado", description: `${email} foi adicionado com a senha definida` });
      } else {
        toast({ title: "Membro adicionado", description: `${email} foi adicionado à equipe` });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao adicionar membro";
      toast({ title: "Erro", description: message, variant: "destructive" });
    }
  };

  const handleSetPassword = async () => {
    if (!passwordMember) return;
    if (!newPassword || newPassword.length < 6) {
      toast({ title: "Erro", description: "A senha deve ter pelo menos 6 caracteres", variant: "destructive" });
      return;
    }
    try {
      await setMemberPassword.mutateAsync({
        memberId: passwordMember.id,
        password: newPassword
      });
      toast({ title: "Senha definida", description: `A senha de ${passwordMember.name} foi atualizada` });
      setPasswordDialogOpen(false);
      setPasswordMember(null);
      setNewPassword("");
      setShowNewPassword(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao definir senha";
      toast({ title: "Erro", description: message, variant: "destructive" });
    }
  };

  const copySetupLink = () => {
    if (setupLinkDialog.link) {
      navigator.clipboard.writeText(setupLinkDialog.link);
      toast({ title: "Link copiado", description: "O link foi copiado para a área de transferência" });
    }
  };

  const handleUpdateName = async () => {
    if (!nameMember) return;
    if (!editFirstName.trim()) {
      toast({ title: "Erro", description: "O nome é obrigatório", variant: "destructive" });
      return;
    }
    try {
      await updateMemberName.mutateAsync({
        memberId: nameMember.id,
        firstName: editFirstName.trim(),
        lastName: editLastName.trim() || undefined,
        orgId
      });
      toast({ title: "Nome atualizado", description: "O nome do membro foi atualizado com sucesso" });
      setNameDialogOpen(false);
      setNameMember(null);
      setEditFirstName("");
      setEditLastName("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao atualizar nome";
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
                <div className="space-y-2">
                  <Label htmlFor="password">Senha (opcional)</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showInvitePassword ? "text" : "password"}
                      placeholder="Deixe vazio para gerar link de configuração"
                      value={inviteForm.password}
                      onChange={(e) => setInviteForm({ ...inviteForm, password: e.target.value })}
                      data-testid="input-invite-password"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0"
                      onClick={() => setShowInvitePassword(!showInvitePassword)}
                    >
                      {showInvitePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Defina uma senha para o usuário ou deixe vazio para gerar um link de configuração.</p>
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
                              setNameMember({ 
                                id: member.id, 
                                firstName: member.user?.firstName || '', 
                                lastName: member.user?.lastName || '' 
                              });
                              setEditFirstName(member.user?.firstName || '');
                              setEditLastName(member.user?.lastName || '');
                              setNameDialogOpen(true);
                            }}>
                              <Pencil className="w-4 h-4 mr-2" />
                              Editar Nome
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => {
                              const name = `${member.user?.firstName || ''} ${member.user?.lastName || ''}`.trim();
                              setSelectedMember({ id: member.id, role: member.role, name });
                              setNewRole(member.role as z.infer<typeof userRoleEnum>);
                              setRoleDialogOpen(true);
                            }}>
                              <UserCog className="w-4 h-4 mr-2" />
                              Alterar Função
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => {
                              const name = `${member.user?.firstName || ''} ${member.user?.lastName || ''}`.trim();
                              setPasswordMember({ id: member.id, name });
                              setNewPassword("");
                              setPasswordDialogOpen(true);
                            }}>
                              <KeyRound className="w-4 h-4 mr-2" />
                              Definir Senha
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

      <Dialog open={setupLinkDialog.open} onOpenChange={(open) => setSetupLinkDialog({ ...setupLinkDialog, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Membro Adicionado</DialogTitle>
            <DialogDescription>
              {setupLinkDialog.email} foi adicionado à equipe. Envie o link abaixo para que ele defina sua senha e acesse o sistema.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-xs text-muted-foreground mb-2">Link de configuração de senha (válido por 24 horas):</p>
              <p className="text-sm font-mono break-all select-all">{setupLinkDialog.link}</p>
            </div>
          </div>
          <DialogFooter className="flex-wrap gap-2">
            <Button variant="outline" onClick={() => setSetupLinkDialog({ open: false, email: "", link: null })}>
              Fechar
            </Button>
            <Button onClick={copySetupLink} data-testid="button-copy-setup-link">
              Copiar Link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Definir Senha</DialogTitle>
            <DialogDescription>
              Defina uma nova senha para {passwordMember?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">Nova Senha</Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showNewPassword ? "text" : "password"}
                  placeholder="Mínimo 6 caracteres"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  data-testid="input-new-member-password"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasswordDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSetPassword} disabled={setMemberPassword.isPending} data-testid="button-confirm-password">
              {setMemberPassword.isPending ? "Salvando..." : "Salvar Senha"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={nameDialogOpen} onOpenChange={setNameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Nome</DialogTitle>
            <DialogDescription>
              Altere o nome e sobrenome do membro
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="editFirstName">Nome</Label>
              <Input
                id="editFirstName"
                placeholder="Nome"
                value={editFirstName}
                onChange={(e) => setEditFirstName(e.target.value)}
                data-testid="input-edit-first-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editLastName">Sobrenome</Label>
              <Input
                id="editLastName"
                placeholder="Sobrenome (opcional)"
                value={editLastName}
                onChange={(e) => setEditLastName(e.target.value)}
                data-testid="input-edit-last-name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNameDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleUpdateName} disabled={updateMemberName.isPending} data-testid="button-confirm-name">
              {updateMemberName.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </DashboardLayout>
  );
}
