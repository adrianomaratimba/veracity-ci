import { useOrganization, useOrganizationMembers, useInviteMember } from "@/hooks/use-organizations";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Plus, Users, Mail, Shield, MoreVertical, UserPlus } from "lucide-react";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { userRoleEnum } from "@shared/schema";
import { z } from "zod";

export default function TeamPage({ params }: { params: { orgId: string } }) {
  const orgId = parseInt(params.orgId);
  const { data: org, isLoading: orgLoading } = useOrganization(orgId);
  const { data: members, isLoading: membersLoading } = useOrganizationMembers(orgId);
  const inviteMember = useInviteMember();
  const { toast } = useToast();

  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    email: "",
    role: "entrevistador" as z.infer<typeof userRoleEnum>
  });

  if (orgLoading || membersLoading) return <LoadingScreen message="Carregando equipe..." />;
  if (!org) return <div>Organizacao nao encontrada</div>;

  const handleInvite = async () => {
    if (!inviteForm.email.trim()) {
      toast({ title: "Erro", description: "O email e obrigatorio", variant: "destructive" });
      return;
    }
    try {
      await inviteMember.mutateAsync({
        orgId,
        email: inviteForm.email,
        role: inviteForm.role
      });
      toast({ title: "Convite enviado", description: `Convite enviado para ${inviteForm.email}` });
      setIsInviteOpen(false);
      setInviteForm({ email: "", role: "entrevistador" });
    } catch (error) {
      toast({ title: "Erro", description: "Falha ao enviar convite", variant: "destructive" });
    }
  };

  const getRoleBadge = (role: string) => {
    const config: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
      'proprietario': { label: 'Proprietario', variant: 'default' },
      'admin': { label: 'Administrador', variant: 'default' },
      'coordenador': { label: 'Coordenador', variant: 'secondary' },
      'entrevistador': { label: 'Entrevistador', variant: 'secondary' },
      'visualizador': { label: 'Visualizador', variant: 'outline' },
    };
    const c = config[role] || { label: role, variant: 'outline' as const };
    return <Badge variant={c.variant}>{c.label}</Badge>;
  };

  const roleOptions = [
    { value: "admin", label: "Administrador", description: "Acesso total a configuracoes" },
    { value: "coordenador", label: "Coordenador", description: "Gerencia pesquisas e entrevistadores" },
    { value: "entrevistador", label: "Entrevistador", description: "Realiza entrevistas em campo" },
    { value: "visualizador", label: "Visualizador", description: "Apenas visualiza resultados" },
  ];

  return (
    <DashboardLayout orgId={params.orgId}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold">Equipe</h1>
            <p className="text-muted-foreground">Gerencie os membros da sua organizacao</p>
          </div>
          <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2" data-testid="button-invite-member">
                <UserPlus className="w-4 h-4" /> Convidar Membro
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Convidar Novo Membro</DialogTitle>
                <DialogDescription>Envie um convite para adicionar um novo membro a equipe</DialogDescription>
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
                  <Label htmlFor="role">Funcao</Label>
                  <Select value={inviteForm.role} onValueChange={(v) => setInviteForm({ ...inviteForm, role: v as z.infer<typeof userRoleEnum> })}>
                    <SelectTrigger data-testid="select-invite-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {roleOptions.map(r => (
                        <SelectItem key={r.value} value={r.value}>
                          <div className="flex flex-col">
                            <span>{r.label}</span>
                            <span className="text-xs text-muted-foreground">{r.description}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsInviteOpen(false)}>Cancelar</Button>
                <Button onClick={handleInvite} disabled={inviteMember.isPending} data-testid="button-send-invite">
                  {inviteMember.isPending ? "Enviando..." : "Enviar Convite"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Users className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{members?.length || 0}</p>
                  <p className="text-xs text-muted-foreground">Total de Membros</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <Shield className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{members?.filter(m => m.role === 'admin' || m.role === 'proprietario').length || 0}</p>
                  <p className="text-xs text-muted-foreground">Administradores</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Users className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{members?.filter(m => m.role === 'coordenador').length || 0}</p>
                  <p className="text-xs text-muted-foreground">Coordenadores</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <Users className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{members?.filter(m => m.role === 'entrevistador').length || 0}</p>
                  <p className="text-xs text-muted-foreground">Entrevistadores</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Membros da Equipe</CardTitle>
            <CardDescription>Lista de todos os membros com acesso a organizacao</CardDescription>
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
                      {getRoleBadge(member.role)}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" data-testid={`button-member-menu-${index}`}>
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>Alterar Funcao</DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive">Remover</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum membro na equipe ainda.</p>
                <p className="text-sm">Convide membros para comecar a colaborar.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
