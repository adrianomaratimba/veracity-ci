import { useOrganization } from "@/hooks/use-organizations";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, CreditCard, Bell, Shield, Save, Check, AlertTriangle } from "lucide-react";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";

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

  const [notifications, setNotifications] = useState({
    emailAlerts: true,
    fraudAlerts: true,
    dailyReports: false,
    weeklyReports: true
  });

  useEffect(() => {
    if (org) {
      setOrgForm({
        name: org.name,
        slug: org.slug,
        maxInterviews: org.maxInterviews || 100,
        maxUsers: org.maxUsers || 5
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

  if (orgLoading) return <LoadingScreen message="Carregando configuracoes..." />;
  if (!org) return <div>Organizacao nao encontrada</div>;

  const handleSaveOrg = () => {
    updateOrg.mutate({ name: orgForm.name, slug: orgForm.slug });
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
          <TabsList className="grid w-full grid-cols-4 max-w-2xl">
            <TabsTrigger value="general" className="gap-2" data-testid="tab-general">
              <Building2 className="w-4 h-4" /> Geral
            </TabsTrigger>
            <TabsTrigger value="billing" className="gap-2" data-testid="tab-billing">
              <CreditCard className="w-4 h-4" /> Plano
            </TabsTrigger>
            <TabsTrigger value="notifications" className="gap-2" data-testid="tab-notifications">
              <Bell className="w-4 h-4" /> Notificacoes
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
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold">Plano Pro</span>
                        <Badge>Popular</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">1.000 entrevistas/mes, 20 usuarios, 50 GB</p>
                      <Button className="w-full" data-testid="button-upgrade-pro">Fazer Upgrade</Button>
                    </div>
                  )}
                  {org.plan !== 'enterprise' && (
                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold">Enterprise</span>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">Ilimitado, suporte prioritario, SLA</p>
                      <Button variant="outline" className="w-full" data-testid="button-contact-sales">Falar com Vendas</Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

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
    </DashboardLayout>
  );
}
