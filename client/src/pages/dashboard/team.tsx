import { useOrganization, useOrganizationMembers, useCurrentMember, useInviteMember, useUpdateMemberProfile, useRemoveMember } from "@/hooks/use-organizations";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Users, Shield, MoreVertical, UserPlus, Trash2, Eye, EyeOff, Pencil, Camera } from "lucide-react";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useState, useRef } from "react";
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
  const updateMemberProfile = useUpdateMemberProfile();
  const removeMember = useRemoveMember();
  const { toast } = useToast();

  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    email: "",
    firstName: "",
    lastName: "",
    role: "interviewer" as z.infer<typeof userRoleEnum>,
    password: "",
    profileImageUrl: ""
  });
  const [showInvitePassword, setShowInvitePassword] = useState(false);
  const [isUploadingInvitePhoto, setIsUploadingInvitePhoto] = useState(false);

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editMember, setEditMember] = useState<{
    id: number;
    firstName: string;
    lastName: string;
    role: string;
    profileImageUrl: string | null;
  } | null>(null);
  const [editForm, setEditForm] = useState({
    firstName: "",
    lastName: "",
    role: "" as z.infer<typeof userRoleEnum>,
    password: "",
    profileImageUrl: ""
  });
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [isUploadingEditPhoto, setIsUploadingEditPhoto] = useState(false);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [memberToDelete, setMemberToDelete] = useState<{ id: number; name: string } | null>(null);
  const [setupLinkDialog, setSetupLinkDialog] = useState<{ open: boolean; email: string; link: string | null }>({ open: false, email: "", link: null });

  const invitePhotoInputRef = useRef<HTMLInputElement>(null);
  const editPhotoInputRef = useRef<HTMLInputElement>(null);

  if (orgLoading || membersLoading || currentMemberLoading) return <LoadingScreen message="Carregando equipe..." />;
  if (!org) return <div>Organização não encontrada</div>;

  const isOwner = currentMember?.role === 'owner';
  const isAdmin = currentMember?.role === 'admin';
  const canManageMembers = isOwner || isAdmin;

  const getManageableRoles = () => {
    if (isOwner) return ['admin', 'coordinator', 'interviewer', 'viewer'];
    if (isAdmin) return ['coordinator', 'interviewer', 'viewer'];
    return [];
  };

  const canManageMember = (memberRole: string) => {
    if (isOwner) return memberRole !== 'owner';
    if (isAdmin) return ['coordinator', 'interviewer', 'viewer'].includes(memberRole);
    return false;
  };

  const manageableRoles = getManageableRoles();

  const handlePhotoUpload = async (file: File, target: 'invite' | 'edit') => {
    const setUploading = target === 'invite' ? setIsUploadingInvitePhoto : setIsUploadingEditPhoto;
    setUploading(true);
    
    try {
      const urlRes = await fetch("/api/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
        credentials: "include"
      });
      
      if (!urlRes.ok) throw new Error("Falha ao obter URL de upload");
      
      const { uploadURL, objectPath } = await urlRes.json();
      
      await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type }
      });

      if (target === 'invite') {
        setInviteForm(prev => ({ ...prev, profileImageUrl: objectPath }));
      } else {
        setEditForm(prev => ({ ...prev, profileImageUrl: objectPath }));
      }
      
      toast({ title: "Foto enviada", description: "A foto foi carregada com sucesso" });
    } catch (error) {
      toast({ title: "Erro", description: "Falha ao enviar foto", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

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
        password: inviteForm.password || undefined,
        firstName: inviteForm.firstName || undefined,
        lastName: inviteForm.lastName || undefined,
        profileImageUrl: inviteForm.profileImageUrl || undefined
      });
      
      setIsInviteOpen(false);
      const email = inviteForm.email;
      const hadPassword = !!inviteForm.password;
      setInviteForm({ email: "", firstName: "", lastName: "", role: "interviewer", password: "", profileImageUrl: "" });
      setShowInvitePassword(false);
      
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

  const openEditDialog = (member: any) => {
    setEditMember({
      id: member.id,
      firstName: member.user?.firstName || '',
      lastName: member.user?.lastName || '',
      role: member.role,
      profileImageUrl: member.user?.profileImageUrl || null
    });
    setEditForm({
      firstName: member.user?.firstName || '',
      lastName: member.user?.lastName || '',
      role: member.role,
      password: '',
      profileImageUrl: member.user?.profileImageUrl || ''
    });
    setShowEditPassword(false);
    setEditDialogOpen(true);
  };

  const handleUpdateMember = async () => {
    if (!editMember) return;
    if (!editForm.firstName.trim()) {
      toast({ title: "Erro", description: "O nome é obrigatório", variant: "destructive" });
      return;
    }
    if (editForm.password && editForm.password.length < 6) {
      toast({ title: "Erro", description: "A senha deve ter pelo menos 6 caracteres", variant: "destructive" });
      return;
    }
    
    try {
      await updateMemberProfile.mutateAsync({
        orgId,
        memberId: editMember.id,
        firstName: editForm.firstName.trim(),
        lastName: editForm.lastName.trim() || undefined,
        role: editForm.role !== editMember.role ? editForm.role : undefined,
        password: editForm.password || undefined,
        profileImageUrl: editForm.profileImageUrl !== editMember.profileImageUrl ? editForm.profileImageUrl : undefined
      });
      
      toast({ title: "Membro atualizado", description: "Os dados foram salvos com sucesso" });
      setEditDialogOpen(false);
      setEditMember(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao atualizar membro";
      toast({ title: "Erro", description: message, variant: "destructive" });
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

  const copySetupLink = () => {
    if (setupLinkDialog.link) {
      navigator.clipboard.writeText(setupLinkDialog.link);
      toast({ title: "Link copiado", description: "O link foi copiado para a área de transferência" });
    }
  };

  const getRoleBadgeVariant = (role: string): "default" | "secondary" | "outline" => {
    if (role === 'owner' || role === 'admin') return 'default';
    if (role === 'coordinator' || role === 'interviewer') return 'secondary';
    return 'outline';
  };

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
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Adicionar Novo Membro</DialogTitle>
                  <DialogDescription>Preencha os dados do novo membro da equipe.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="flex justify-center">
                    <div className="relative">
                      <Avatar className="w-20 h-20">
                        <AvatarImage src={inviteForm.profileImageUrl ? inviteForm.profileImageUrl : undefined} />
                        <AvatarFallback className="text-lg">
                          {inviteForm.firstName?.[0]}{inviteForm.lastName?.[0] || ''}
                        </AvatarFallback>
                      </Avatar>
                      <Button
                        type="button"
                        size="icon"
                        variant="secondary"
                        className="absolute -bottom-1 -right-1 rounded-full w-8 h-8"
                        onClick={() => invitePhotoInputRef.current?.click()}
                        disabled={isUploadingInvitePhoto}
                      >
                        <Camera className="w-4 h-4" />
                      </Button>
                      <input
                        ref={invitePhotoInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => e.target.files?.[0] && handlePhotoUpload(e.target.files[0], 'invite')}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">Nome</Label>
                      <Input
                        id="firstName"
                        placeholder="Nome"
                        value={inviteForm.firstName}
                        onChange={(e) => setInviteForm({ ...inviteForm, firstName: e.target.value })}
                        data-testid="input-invite-first-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">Sobrenome</Label>
                      <Input
                        id="lastName"
                        placeholder="Sobrenome"
                        value={inviteForm.lastName}
                        onChange={(e) => setInviteForm({ ...inviteForm, lastName: e.target.value })}
                        data-testid="input-invite-last-name"
                      />
                    </div>
                  </div>
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
                        placeholder="Deixe vazio para gerar link"
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
                  <div key={member.id} className="py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4" data-testid={`row-member-${index}`}>
                    <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                      <Avatar className="shrink-0">
                        <AvatarImage src={member.user?.profileImageUrl || undefined} />
                        <AvatarFallback>
                          {member.user?.firstName?.[0]}{member.user?.lastName?.[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">
                          {member.user?.firstName} {member.user?.lastName}
                        </p>
                        <p className="text-sm text-muted-foreground truncate">{member.user?.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3 ml-11 sm:ml-0">
                      <Badge variant={getRoleBadgeVariant(member.role)}>{getRoleLabel(member.role)}</Badge>
                      {canManageMember(member.role) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" data-testid={`button-member-menu-${index}`}>
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditDialog(member)}>
                              <Pencil className="w-4 h-4 mr-2" />
                              Editar
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

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Membro</DialogTitle>
            <DialogDescription>Altere os dados do membro da equipe.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex justify-center">
              <div className="relative">
                <Avatar className="w-20 h-20">
                  <AvatarImage src={editForm.profileImageUrl || undefined} />
                  <AvatarFallback className="text-lg">
                    {editForm.firstName?.[0]}{editForm.lastName?.[0] || ''}
                  </AvatarFallback>
                </Avatar>
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  className="absolute -bottom-1 -right-1 rounded-full w-8 h-8"
                  onClick={() => editPhotoInputRef.current?.click()}
                  disabled={isUploadingEditPhoto}
                >
                  <Camera className="w-4 h-4" />
                </Button>
                <input
                  ref={editPhotoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handlePhotoUpload(e.target.files[0], 'edit')}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="editFirstName">Nome</Label>
                <Input
                  id="editFirstName"
                  placeholder="Nome"
                  value={editForm.firstName}
                  onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                  data-testid="input-edit-first-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editLastName">Sobrenome</Label>
                <Input
                  id="editLastName"
                  placeholder="Sobrenome"
                  value={editForm.lastName}
                  onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                  data-testid="input-edit-last-name"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="editRole">Função</Label>
              <Select value={editForm.role} onValueChange={(v) => setEditForm({ ...editForm, role: v as z.infer<typeof userRoleEnum> })}>
                <SelectTrigger data-testid="select-edit-role">
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
              <Label htmlFor="editPassword">Nova Senha (opcional)</Label>
              <div className="relative">
                <Input
                  id="editPassword"
                  type={showEditPassword ? "text" : "password"}
                  placeholder="Deixe vazio para manter a atual"
                  value={editForm.password}
                  onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                  data-testid="input-edit-password"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0"
                  onClick={() => setShowEditPassword(!showEditPassword)}
                >
                  {showEditPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleUpdateMember} disabled={updateMemberProfile.isPending} data-testid="button-save-edit">
              {updateMemberProfile.isPending ? "Salvando..." : "Salvar"}
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

    </DashboardLayout>
  );
}
