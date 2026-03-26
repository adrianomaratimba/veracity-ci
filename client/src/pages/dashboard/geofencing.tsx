import { useState, useEffect, useMemo } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useSurveys, useUpdateSurvey } from "@/hooks/use-surveys";
import { GEOFENCE_NAMES, extractPolygonFromGeoJSON } from "@/lib/geofences";
import { apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  MapPin, Bell, BellOff, Users, AlertTriangle, ShieldAlert, ShieldCheck,
  Loader2, Trash2, Plus, RefreshCw, CheckCircle, Upload, Globe, Pencil
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

function formatDate(d: string | Date | null | undefined) {
  if (!d) return "-";
  return format(new Date(d), "dd/MM/yy HH:mm", { locale: ptBR });
}

// ---------- Sub-components ----------

function GeofenceConfigTab({ orgId }: { orgId: number }) {
  const { data: surveys = [], isLoading } = useSurveys(orgId);
  const updateSurvey = useUpdateSurvey();
  const { toast } = useToast();

  const { data: customGeofences = [] } = useQuery({
    queryKey: ['/api/organizations', orgId, 'custom-geofences'],
    queryFn: async () => {
      const res = await fetch(`/api/organizations/${orgId}/custom-geofences`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!orgId,
  });

  const cities = useMemo(() =>
    [...new Set((customGeofences as any[]).filter((f: any) => f.city).map((f: any) => f.city as string))],
    [customGeofences]
  );

  const activeSurveys = surveys.filter((s: any) => s.status !== 'archived' && s.status !== 'draft');

  function getSelectValue(survey: any): string {
    if (!survey.geofenceNeighborhood && !survey.customGeofenceId && !survey.geofenceCity) return "none";
    if (survey.geofenceCity) return `city:${survey.geofenceCity}`;
    if (survey.customGeofenceId) return `custom:${survey.customGeofenceId}`;
    return `static:${survey.geofenceNeighborhood}`;
  }

  async function handleNeighborhoodChange(surveyId: number, value: string) {
    try {
      if (value === "none") {
        await updateSurvey.mutateAsync({
          id: surveyId, orgId,
          data: { geofenceNeighborhood: null, customGeofenceId: null, geofenceCity: null } as any,
        });
      } else if (value.startsWith("city:")) {
        const city = value.slice(5);
        await updateSurvey.mutateAsync({
          id: surveyId, orgId,
          data: { geofenceNeighborhood: city, customGeofenceId: null, geofenceCity: city } as any,
        });
      } else if (value.startsWith("static:")) {
        const name = value.slice(7);
        await updateSurvey.mutateAsync({
          id: surveyId, orgId,
          data: { geofenceNeighborhood: name, customGeofenceId: null, geofenceCity: null } as any,
        });
      } else if (value.startsWith("custom:")) {
        const id = parseInt(value.slice(7));
        const fence = (customGeofences as any[]).find((f: any) => f.id === id);
        await updateSurvey.mutateAsync({
          id: surveyId, orgId,
          data: { geofenceNeighborhood: fence?.name || null, customGeofenceId: id, geofenceCity: null } as any,
        });
      }
      toast({ title: "Geocerca atualizada" });
    } catch {
      toast({ title: "Erro ao atualizar", variant: "destructive" });
    }
  }

  async function handleBlockingChange(surveyId: number, value: boolean) {
    try {
      await updateSurvey.mutateAsync({
        id: surveyId,
        orgId,
        data: { geofenceBlocking: value } as any,
      });
      toast({ title: value ? "Bloqueio ativado" : "Bloqueio desativado" });
    } catch {
      toast({ title: "Erro ao atualizar", variant: "destructive" });
    }
  }

  if (isLoading) return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );

  if (activeSurveys.length === 0) return (
    <Card>
      <CardContent className="py-12 text-center text-muted-foreground">
        Nenhuma pesquisa ativa. Crie uma pesquisa para configurar geocerca.
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Configure a delimitação geográfica de cada pesquisa. Entrevistadoras serão alertadas ou bloqueadas ao sair do bairro designado.
      </p>
      {activeSurveys.map((survey: any) => (
        <Card key={survey.id} data-testid={`card-geofence-survey-${survey.id}`}>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="text-base">{survey.title}</CardTitle>
                <CardDescription className="text-xs mt-1">
                  Status: <Badge variant="outline" className="text-xs">{survey.status}</Badge>
                </CardDescription>
              </div>
              {(survey as any).geofenceNeighborhood ? (
                <Badge className="bg-green-100 text-green-800 border-green-200 shrink-0">
                  <MapPin className="w-3 h-3 mr-1" />
                  {(survey as any).geofenceNeighborhood}
                </Badge>
              ) : (
                <Badge variant="secondary" className="shrink-0">Sem geocerca</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Zona de coleta</Label>
              <Select
                value={getSelectValue(survey)}
                onValueChange={(v) => handleNeighborhoodChange(survey.id, v)}
                disabled={updateSurvey.isPending}
              >
                <SelectTrigger data-testid={`select-neighborhood-${survey.id}`} className="max-w-xs">
                  <SelectValue placeholder="Sem restrição geográfica" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem restrição geográfica</SelectItem>
                  {cities.length > 0 && (
                    <>
                      <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Município inteiro</div>
                      {cities.map(city => (
                        <SelectItem key={`city:${city}`} value={`city:${city}`}>
                          <Globe className="w-3 h-3 mr-1 inline" />{city} — todos os bairros
                        </SelectItem>
                      ))}
                    </>
                  )}
                  {GEOFENCE_NAMES.length > 0 && (
                    <>
                      <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Bairros predefinidos</div>
                      {GEOFENCE_NAMES.map(name => (
                        <SelectItem key={name} value={`static:${name}`}>{name}</SelectItem>
                      ))}
                    </>
                  )}
                  {(customGeofences as any[]).length > 0 && (
                    <>
                      <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Bairros individuais</div>
                      {(customGeofences as any[]).map((f: any) => (
                        <SelectItem key={f.id} value={`custom:${f.id}`}>
                          {f.name}{f.city ? ` (${f.city})` : ''}
                        </SelectItem>
                      ))}
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>

            {(survey as any).geofenceNeighborhood && (
              <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                <div className="space-y-0.5">
                  <Label htmlFor={`blocking-${survey.id}`} className="text-sm font-medium cursor-pointer">
                    Bloquear coleta fora do bairro
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Se ativado, impede o envio de respostas quando a entrevistadora estiver fora do setor.
                  </p>
                </div>
                <Switch
                  id={`blocking-${survey.id}`}
                  checked={(survey as any).geofenceBlocking ?? false}
                  onCheckedChange={(v) => handleBlockingChange(survey.id, v)}
                  disabled={updateSurvey.isPending}
                  data-testid={`switch-blocking-${survey.id}`}
                />
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ZoneAssignmentTab({ orgId }: { orgId: number }) {
  const { data: surveys = [] } = useSurveys(orgId);
  const [selectedSurveyId, setSelectedSurveyId] = useState<number | null>(null);
  const [selectedInterviewerId, setSelectedInterviewerId] = useState("");
  const [checkedZones, setCheckedZones] = useState<string[]>([]);
  const { toast } = useToast();
  const qc = useQueryClient();

  const geofencedSurveys = surveys.filter((s: any) =>
    (s as any).geofenceNeighborhood || (s as any).customGeofenceId || (s as any).geofenceCity
  );

  const { data: members = [] } = useQuery({
    queryKey: ['/api/organizations', orgId, 'members'],
    queryFn: async () => {
      const res = await fetch(`/api/organizations/${orgId}/members`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!orgId,
  });

  const interviewers = members.filter((m: any) => m.role === 'interviewer');

  const { data: customGeofences = [] } = useQuery({
    queryKey: ['/api/organizations', orgId, 'custom-geofences'],
    queryFn: async () => {
      const res = await fetch(`/api/organizations/${orgId}/custom-geofences`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!orgId,
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ['/api/organizations', orgId, 'zone-assignments', selectedSurveyId],
    queryFn: async () => {
      const url = selectedSurveyId
        ? `/api/organizations/${orgId}/zone-assignments?surveyId=${selectedSurveyId}`
        : `/api/organizations/${orgId}/zone-assignments`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!orgId,
  });

  const selectedSurvey = geofencedSurveys.find((s: any) => s.id === selectedSurveyId) as any;

  // Determine available zones for the selected survey
  const availableZones: { id: string; name: string; city?: string; population?: number }[] = useMemo(() => {
    if (!selectedSurvey) return [];
    const fences = customGeofences as any[];
    if (selectedSurvey.geofenceCity) {
      return fences
        .filter((f: any) => f.city === selectedSurvey.geofenceCity)
        .map((f: any) => ({ id: f.name, name: f.name, city: f.city, population: f.populationCount }));
    }
    if (selectedSurvey.customGeofenceId) {
      const thisFence = fences.find((f: any) => f.id === selectedSurvey.customGeofenceId);
      if (thisFence?.city) {
        return fences
          .filter((f: any) => f.city === thisFence.city)
          .map((f: any) => ({ id: f.name, name: f.name, city: f.city, population: f.populationCount }));
      }
      return thisFence ? [{ id: thisFence.name, name: thisFence.name, city: thisFence.city, population: thisFence.populationCount }] : [];
    }
    if (selectedSurvey.geofenceNeighborhood) {
      return GEOFENCE_NAMES.map(name => ({ id: name, name }));
    }
    return fences.map((f: any) => ({ id: f.name, name: f.name, city: f.city, population: f.populationCount }));
  }, [selectedSurvey, customGeofences]);

  // When interviewer changes → load their current assignments for this survey
  useEffect(() => {
    if (!selectedInterviewerId || !selectedSurveyId) { setCheckedZones([]); return; }
    const myAssignments = (assignments as any[])
      .filter((a: any) => a.interviewerId === selectedInterviewerId)
      .map((a: any) => a.neighborhood);
    setCheckedZones(myAssignments);
  }, [selectedInterviewerId, assignments, selectedSurveyId]);

  const allChecked = availableZones.length > 0 && availableZones.every(z => checkedZones.includes(z.id));

  function toggleAll() {
    setCheckedZones(allChecked ? [] : availableZones.map(z => z.id));
  }

  function toggleZone(zoneId: string) {
    setCheckedZones(prev => prev.includes(zoneId) ? prev.filter(z => z !== zoneId) : [...prev, zoneId]);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSurveyId || !selectedInterviewerId) throw new Error("Selecione pesquisa e entrevistadora");
      await apiRequest("PUT", `/api/organizations/${orgId}/zone-assignments/bulk`, {
        surveyId: selectedSurveyId,
        interviewerId: selectedInterviewerId,
        neighborhoods: checkedZones,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/organizations', orgId, 'zone-assignments'] });
      toast({ title: "Atribuições salvas com sucesso" });
    },
    onError: (err: any) => toast({ title: err.message || "Erro ao salvar", variant: "destructive" }),
  });

  // Summary: assignments grouped by interviewer
  const assignmentsByInterviewer = useMemo(() => {
    const map = new Map<string, { name: string; zones: string[] }>();
    for (const a of assignments as any[]) {
      if (!map.has(a.interviewerId)) {
        map.set(a.interviewerId, { name: a.interviewerName, zones: [] });
      }
      map.get(a.interviewerId)!.zones.push(a.neighborhood);
    }
    return [...map.entries()].map(([id, v]) => ({ interviewerId: id, ...v }));
  }, [assignments]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Defina quais bairros cada entrevistadora cobre em cada pesquisa. Marque vários bairros de uma vez ou selecione o município inteiro.
      </p>

      {geofencedSurveys.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhuma pesquisa tem geocerca configurada. Configure na aba <strong>Configuração</strong> primeiro.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-4">
            <div className="space-y-1 flex-1 min-w-[200px]">
              <Label className="text-xs font-semibold">Pesquisa</Label>
              <Select
                value={selectedSurveyId?.toString() || ""}
                onValueChange={(v) => { setSelectedSurveyId(parseInt(v)); setSelectedInterviewerId(""); setCheckedZones([]); }}
              >
                <SelectTrigger data-testid="select-survey-zone">
                  <SelectValue placeholder="Selecionar pesquisa..." />
                </SelectTrigger>
                <SelectContent>
                  {geofencedSurveys.map((s: any) => (
                    <SelectItem key={s.id} value={s.id.toString()}>
                      {s.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedSurveyId && (
              <div className="space-y-1 flex-1 min-w-[200px]">
                <Label className="text-xs font-semibold">Entrevistadora</Label>
                <Select
                  value={selectedInterviewerId}
                  onValueChange={(v) => setSelectedInterviewerId(v)}
                >
                  <SelectTrigger data-testid="select-interviewer-assignment">
                    <SelectValue placeholder="Selecionar entrevistadora..." />
                  </SelectTrigger>
                  <SelectContent>
                    {interviewers.map((m: any) => (
                      <SelectItem key={m.userId} value={m.userId}>
                        {m.user?.firstName} {m.user?.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {selectedSurveyId && selectedInterviewerId && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Selecionar zonas de coleta</CardTitle>
                  <Badge variant="secondary">{checkedZones.length} selecionado(s)</Badge>
                </div>
                {selectedSurvey?.geofenceCity && (
                  <CardDescription className="text-xs">
                    <Globe className="w-3 h-3 inline mr-1" />Município: {selectedSurvey.geofenceCity} — {availableZones.length} bairros disponíveis
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                {availableZones.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Nenhum bairro disponível para esta pesquisa.</p>
                ) : (
                  <>
                    {/* Municipality-wide toggle */}
                    <div
                      className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${allChecked ? 'border-primary bg-primary/5' : 'border-dashed border-muted-foreground/30 hover:border-primary/50'}`}
                      onClick={toggleAll}
                      data-testid="checkbox-municipality-all"
                    >
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${allChecked ? 'bg-primary border-primary' : 'border-muted-foreground/50'}`}>
                        {allChecked && <CheckCircle className="w-3 h-3 text-white" />}
                      </div>
                      <div>
                        <p className="text-sm font-semibold">
                          {selectedSurvey?.geofenceCity ? `${selectedSurvey.geofenceCity} — Município inteiro` : 'Selecionar todos'}
                        </p>
                        <p className="text-xs text-muted-foreground">{availableZones.length} bairros</p>
                      </div>
                    </div>

                    {/* Individual zone checkboxes in a grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {availableZones.map(zone => {
                        const checked = checkedZones.includes(zone.id);
                        return (
                          <div
                            key={zone.id}
                            className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors ${checked ? 'border-primary bg-primary/5' : 'border-muted hover:border-primary/40'}`}
                            onClick={() => toggleZone(zone.id)}
                            data-testid={`checkbox-zone-${zone.id}`}
                          >
                            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${checked ? 'bg-primary border-primary' : 'border-muted-foreground/40'}`}>
                              {checked && <CheckCircle className="w-2.5 h-2.5 text-white" />}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-medium truncate">{zone.name}</p>
                              {zone.population ? (
                                <p className="text-xs text-muted-foreground">{zone.population.toLocaleString('pt-BR')} hab.</p>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}

                <div className="flex justify-end">
                  <Button
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending}
                    data-testid="button-save-zone-assignments"
                  >
                    {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                    Salvar atribuições
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Summary table: all current assignments */}
          {selectedSurveyId && assignmentsByInterviewer.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Resumo de atribuições — {selectedSurvey?.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Entrevistadora</TableHead>
                      <TableHead>Bairros atribuídos</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assignmentsByInterviewer.map((a) => (
                      <TableRow key={a.interviewerId} data-testid={`row-assignment-${a.interviewerId}`}>
                        <TableCell className="font-medium">{a.name}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {a.zones.map(z => (
                              <Badge key={z} variant="outline" className="text-xs gap-1">
                                <MapPin className="w-2.5 h-2.5" />{z}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function PushNotificationTab({ orgId }: { orgId: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: vapidData } = useQuery<{ publicKey: string | null }>({
    queryKey: ['/api/push/vapid-public-key'],
    queryFn: () => fetch('/api/push/vapid-public-key', { credentials: 'include' }).then(r => r.json()),
  });

  const { data: statusData, refetch: refetchStatus } = useQuery<{ subscribed: boolean }>({
    queryKey: ['/api/organizations', orgId, 'push/status'],
    queryFn: () => fetch(`/api/organizations/${orgId}/push/status`, { credentials: 'include' }).then(r => r.json()),
    enabled: !!orgId,
  });

  const [isProcessing, setIsProcessing] = useState(false);
  const isSubscribed = statusData?.subscribed ?? false;
  const publicKey = vapidData?.publicKey;

  function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    return new Uint8Array([...rawData].map(char => char.charCodeAt(0)));
  }

  async function handleSubscribe() {
    if (!publicKey) return toast({ title: "Chave VAPID não configurada", variant: "destructive" });
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      return toast({ title: "Notificações push não suportadas neste navegador", variant: "destructive" });
    }
    setIsProcessing(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        return toast({ title: "Permissão de notificação negada", description: "Habilite as notificações nas configurações do navegador.", variant: "destructive" });
      }
      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      await apiRequest("POST", `/api/organizations/${orgId}/push/subscribe`, { subscription: subscription.toJSON() });
      await refetchStatus();
      toast({ title: "Notificações ativadas!", description: "Você receberá alertas quando entrevistadoras saírem do setor." });
    } catch (err: any) {
      console.error(err);
      toast({ title: "Erro ao ativar notificações", description: err.message, variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleUnsubscribe() {
    setIsProcessing(true);
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) await sub.unsubscribe();
      }
      await apiRequest("DELETE", `/api/organizations/${orgId}/push/subscribe`);
      await refetchStatus();
      toast({ title: "Notificações desativadas" });
    } catch (err: any) {
      toast({ title: "Erro ao desativar", description: err.message, variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div className="space-y-6 max-w-xl">
      <p className="text-sm text-muted-foreground">
        Receba uma notificação no seu dispositivo sempre que uma entrevistadora sair do bairro designado, mesmo com o navegador fechado.
      </p>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isSubscribed ? 'bg-green-100' : 'bg-muted'}`}>
              {isSubscribed
                ? <Bell className="w-6 h-6 text-green-600" />
                : <BellOff className="w-6 h-6 text-muted-foreground" />
              }
            </div>
            <div className="flex-1">
              <p className="font-medium">
                {isSubscribed ? 'Notificações ativas neste dispositivo' : 'Notificações desativadas'}
              </p>
              <p className="text-sm text-muted-foreground">
                {isSubscribed
                  ? 'Você receberá alertas de saída de setor.'
                  : 'Clique para ativar notificações push neste dispositivo.'}
              </p>
            </div>
            {isSubscribed ? (
              <Button variant="outline" onClick={handleUnsubscribe} disabled={isProcessing} data-testid="button-unsubscribe-push">
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <BellOff className="w-4 h-4 mr-2" />}
                Desativar
              </Button>
            ) : (
              <Button onClick={handleSubscribe} disabled={isProcessing} data-testid="button-subscribe-push">
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Bell className="w-4 h-4 mr-2" />}
                Ativar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-muted/30">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start gap-3">
            <CheckCircle className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              As notificações são por dispositivo. Para receber alertas em múltiplos dispositivos, ative em cada um deles separadamente.
              As notificações são enviadas automaticamente quando o sistema registra uma violação de geocerca.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ViolationsTab({ orgId }: { orgId: number }) {
  const [autoRefresh, setAutoRefresh] = useState(true);

  const { data: violations = [], isLoading, refetch } = useQuery({
    queryKey: ['/api/organizations', orgId, 'geofence-violations'],
    queryFn: async () => {
      const res = await fetch(`/api/organizations/${orgId}/geofence-violations`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!orgId,
    refetchInterval: autoRefresh ? 30_000 : false,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Histórico de saídas de setor detectadas. Atualiza automaticamente a cada 30 segundos.
        </p>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch
              id="auto-refresh"
              checked={autoRefresh}
              onCheckedChange={setAutoRefresh}
              data-testid="switch-violations-autorefresh"
            />
            <Label htmlFor="auto-refresh" className="text-xs cursor-pointer">Auto-atualizar</Label>
          </div>
          <Button variant="ghost" size="sm" onClick={() => refetch()} data-testid="button-refresh-violations">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : violations.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-muted-foreground gap-2">
              <ShieldCheck className="w-10 h-10" />
              <p className="text-sm">Nenhuma violação registrada</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entrevistadora</TableHead>
                  <TableHead>Pesquisa</TableHead>
                  <TableHead>Bairro</TableHead>
                  <TableHead>Data/Hora</TableHead>
                  <TableHead>GPS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {violations.map((v: any) => (
                  <TableRow key={v.id} data-testid={`row-violation-${v.id}`}>
                    <TableCell className="font-medium">{v.interviewerName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{v.surveyTitle}</TableCell>
                    <TableCell>
                      <Badge variant="destructive" className="gap-1 text-xs">
                        <AlertTriangle className="w-3 h-3" />{v.neighborhood}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(v.createdAt)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {v.latitude != null && v.longitude != null
                        ? `${v.latitude.toFixed(4)}, ${v.longitude.toFixed(4)}`
                        : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- Custom Geofences Tab ----------

function CustomGeofencesTab({ orgId }: { orgId: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [populationCount, setPopulationCount] = useState("");
  const [geojsonText, setGeojsonText] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [editingFence, setEditingFence] = useState<any | null>(null);
  const [editName, setEditName] = useState("");
  const [editCity, setEditCity] = useState("");
  const [editPopulation, setEditPopulation] = useState("");

  const { data: geofences = [], isLoading } = useQuery({
    queryKey: ['/api/organizations', orgId, 'custom-geofences'],
    queryFn: async () => {
      const res = await fetch(`/api/organizations/${orgId}/custom-geofences`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!orgId,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      setParseError(null);
      const result = extractPolygonFromGeoJSON(geojsonText);
      if (result.error) {
        setParseError(result.error);
        throw new Error(result.error);
      }
      const polygon = result.coordinates!;
      const res = await apiRequest("POST", `/api/organizations/${orgId}/custom-geofences`, {
        name: name.trim(),
        city: city.trim() || null,
        populationCount: populationCount ? parseInt(populationCount) : null,
        polygon,
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/organizations', orgId, 'custom-geofences'] });
      setName("");
      setCity("");
      setPopulationCount("");
      setGeojsonText("");
      setParseError(null);
      toast({ title: "Geocerca importada com sucesso" });
    },
    onError: (err: any) => {
      if (!parseError) toast({ title: err.message || "Erro ao importar", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/organizations/${orgId}/custom-geofences/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/organizations', orgId, 'custom-geofences'] });
      toast({ title: "Geocerca removida" });
    },
    onError: () => toast({ title: "Erro ao remover", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingFence) return;
      await apiRequest("PATCH", `/api/organizations/${orgId}/custom-geofences/${editingFence.id}`, {
        name: editName.trim(),
        city: editCity.trim() || null,
        populationCount: editPopulation ? parseInt(editPopulation) : null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/organizations', orgId, 'custom-geofences'] });
      setEditingFence(null);
      toast({ title: "Geocerca atualizada" });
    },
    onError: () => toast({ title: "Erro ao atualizar", variant: "destructive" }),
  });

  function openEdit(fence: any) {
    setEditingFence(fence);
    setEditName(fence.name || "");
    setEditCity(fence.city || "");
    setEditPopulation(fence.populationCount != null ? String(fence.populationCount) : "");
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="w-4 h-4" />
            Importar Geocerca via GeoJSON
          </CardTitle>
          <CardDescription>
            Importe um polígono GeoJSON para definir uma zona personalizada de coleta. Você pode exportar polígonos de ferramentas como geojson.io.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label>Nome da geocerca *</Label>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Ex: Centro"
                data-testid="input-geofence-name"
              />
            </div>
            <div className="space-y-1">
              <Label>Cidade / Município</Label>
              <Input
                value={city}
                onChange={e => setCity(e.target.value)}
                placeholder="Ex: Marataízes"
                data-testid="input-geofence-city"
              />
            </div>
            <div className="space-y-1">
              <Label>População (habitantes)</Label>
              <Input
                type="number"
                min="0"
                value={populationCount}
                onChange={e => setPopulationCount(e.target.value)}
                placeholder="Ex: 3500"
                data-testid="input-geofence-population"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label>GeoJSON *</Label>
            <Textarea
              value={geojsonText}
              onChange={e => { setGeojsonText(e.target.value); setParseError(null); }}
              placeholder='Cole aqui o GeoJSON (Polygon, Feature ou FeatureCollection)...'
              className="font-mono text-xs h-40 resize-none"
              data-testid="textarea-geofence-geojson"
            />
            {parseError && (
              <p className="text-xs text-destructive mt-1">{parseError}</p>
            )}
          </div>

          <Button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || !name.trim() || !geojsonText.trim()}
            data-testid="button-import-geofence"
          >
            {createMutation.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Importando...</>
            ) : (
              <><Upload className="w-4 h-4 mr-2" />Importar Geocerca</>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Geocercas importadas</CardTitle>
          <CardDescription>Lista de zonas personalizadas disponíveis para atribuição às pesquisas.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : (geofences as any[]).length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Globe className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Nenhuma geocerca importada ainda.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Cidade</TableHead>
                  <TableHead>População</TableHead>
                  <TableHead>Criada em</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(geofences as any[]).map((f: any) => (
                  <TableRow key={f.id} data-testid={`row-geofence-${f.id}`}>
                    <TableCell className="font-medium">{f.name}</TableCell>
                    <TableCell>{f.city || '—'}</TableCell>
                    <TableCell>{f.populationCount ? f.populationCount.toLocaleString('pt-BR') + ' hab.' : '—'}</TableCell>
                    <TableCell>{formatDate(f.createdAt)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => openEdit(f)}
                          data-testid={`button-edit-geofence-${f.id}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => deleteMutation.mutate(f.id)}
                          disabled={deleteMutation.isPending}
                          data-testid={`button-delete-geofence-${f.id}`}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editingFence} onOpenChange={(open) => { if (!open) setEditingFence(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Geocerca</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Nome *</Label>
              <Input
                value={editName}
                onChange={e => setEditName(e.target.value)}
                placeholder="Ex: Centro"
                data-testid="input-edit-geofence-name"
              />
            </div>
            <div className="space-y-1">
              <Label>Cidade / Município</Label>
              <Input
                value={editCity}
                onChange={e => setEditCity(e.target.value)}
                placeholder="Ex: Marataízes"
                data-testid="input-edit-geofence-city"
              />
            </div>
            <div className="space-y-1">
              <Label>População (habitantes)</Label>
              <Input
                type="number"
                min="0"
                value={editPopulation}
                onChange={e => setEditPopulation(e.target.value)}
                placeholder="Ex: 3500"
                data-testid="input-edit-geofence-population"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingFence(null)}>Cancelar</Button>
            <Button
              onClick={() => updateMutation.mutate()}
              disabled={updateMutation.isPending || !editName.trim()}
              data-testid="button-save-edit-geofence"
            >
              {updateMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Salvando...</> : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- Main Page ----------

export default function GeofencingPage() {
  const params = useParams<{ orgId: string }>();
  const orgId = parseInt(params.orgId || "0");

  return (
    <DashboardLayout orgId={params.orgId}>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <ShieldAlert className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display">Geocerca</h1>
            <p className="text-sm text-muted-foreground">
              Gerenciamento de zonas geográficas para coleta de pesquisas
            </p>
          </div>
        </div>

        <Tabs defaultValue="config">
          <TabsList className="grid grid-cols-5 w-full max-w-2xl">
            <TabsTrigger value="config" data-testid="tab-geofence-config">
              <MapPin className="w-3.5 h-3.5 mr-1.5" />
              Configuração
            </TabsTrigger>
            <TabsTrigger value="interviewers" data-testid="tab-geofence-interviewers">
              <Users className="w-3.5 h-3.5 mr-1.5" />
              Setores
            </TabsTrigger>
            <TabsTrigger value="notifications" data-testid="tab-geofence-notifications">
              <Bell className="w-3.5 h-3.5 mr-1.5" />
              Alertas
            </TabsTrigger>
            <TabsTrigger value="violations" data-testid="tab-geofence-violations">
              <AlertTriangle className="w-3.5 h-3.5 mr-1.5" />
              Violações
            </TabsTrigger>
            <TabsTrigger value="geocercas" data-testid="tab-geofence-custom">
              <Globe className="w-3.5 h-3.5 mr-1.5" />
              Geocercas
            </TabsTrigger>
          </TabsList>

          <div className="mt-6">
            <TabsContent value="config">
              <GeofenceConfigTab orgId={orgId} />
            </TabsContent>
            <TabsContent value="interviewers">
              <ZoneAssignmentTab orgId={orgId} />
            </TabsContent>
            <TabsContent value="notifications">
              <PushNotificationTab orgId={orgId} />
            </TabsContent>
            <TabsContent value="violations">
              <ViolationsTab orgId={orgId} />
            </TabsContent>
            <TabsContent value="geocercas">
              <CustomGeofencesTab orgId={orgId} />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
