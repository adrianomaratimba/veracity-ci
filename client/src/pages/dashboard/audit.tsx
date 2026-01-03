import { useState, useMemo } from "react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { useOrgResponses, useUpdateResponseStatus } from "@/hooks/use-audit";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AlertTriangle, CheckCircle, XCircle, MapPin, Clock, Play, FileAudio, Search, Filter, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface AuditPageProps {
  params: { orgId: string };
}

export default function AuditPage({ params }: AuditPageProps) {
  const orgId = parseInt(params.orgId);
  const { data: responses, isLoading } = useOrgResponses(orgId);
  const updateStatus = useUpdateResponseStatus();
  const { toast } = useToast();

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedResponse, setSelectedResponse] = useState<any | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  const filteredResponses = useMemo(() => {
    if (!responses) return [];
    return responses.filter(r => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          r.survey.title.toLowerCase().includes(query) ||
          r.interviewerId.toLowerCase().includes(query) ||
          String(r.id).includes(query)
        );
      }
      return true;
    });
  }, [responses, statusFilter, searchQuery]);

  const suspiciousCount = responses?.filter(r => r.status === 'suspicious').length || 0;
  const validCount = responses?.filter(r => r.status === 'valid').length || 0;
  const invalidCount = responses?.filter(r => r.status === 'invalid').length || 0;

  const handleApprove = async (responseId: number) => {
    try {
      await updateStatus.mutateAsync({ responseId, status: 'valid', reviewNote: reviewNote || undefined });
      toast({ title: "Aprovada", description: "Entrevista marcada como válida" });
      setDetailDialogOpen(false);
      setSelectedResponse(null);
      setReviewNote("");
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  const handleReject = async (responseId: number) => {
    try {
      await updateStatus.mutateAsync({ responseId, status: 'invalid', reviewNote: reviewNote || undefined });
      toast({ title: "Invalidada", description: "Entrevista marcada como inválida" });
      setDetailDialogOpen(false);
      setSelectedResponse(null);
      setReviewNote("");
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  const openDetail = (response: any) => {
    setSelectedResponse(response);
    setReviewNote(response.reviewNote || "");
    setDetailDialogOpen(true);
  };

  if (isLoading) return <LoadingScreen />;

  return (
    <DashboardLayout orgId={params.orgId}>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-display font-bold">Auditoria de Entrevistas</h1>
          <p className="text-muted-foreground">Revise e valide entrevistas suspeitas</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-audit">{responses?.length || 0}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Suspeitas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                <span className={`text-2xl font-bold ${suspiciousCount > 0 ? 'text-amber-600' : 'text-green-600'}`} data-testid="text-suspicious-audit">
                  {suspiciousCount}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Válidas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-500" />
                <span className="text-2xl font-bold text-green-600" data-testid="text-valid-audit">{validCount}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Inválidas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <XCircle className="w-5 h-5 text-red-500" />
                <span className="text-2xl font-bold text-red-600" data-testid="text-invalid-audit">{invalidCount}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="w-5 h-5" />
              Filtros
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por pesquisa, entrevistador ou ID..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                    data-testid="input-search-audit"
                  />
                </div>
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]" data-testid="select-status-filter">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Status</SelectItem>
                  <SelectItem value="suspicious">Suspeitas</SelectItem>
                  <SelectItem value="valid">Válidas</SelectItem>
                  <SelectItem value="invalid">Inválidas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lista de Entrevistas</CardTitle>
            <CardDescription>{filteredResponses.length} entrevistas encontradas</CardDescription>
          </CardHeader>
          <CardContent>
            {filteredResponses.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                Nenhuma entrevista encontrada com os filtros aplicados
              </div>
            ) : (
              <div className="space-y-3">
                {filteredResponses.map((response) => (
                  <div
                    key={response.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover-elevate cursor-pointer"
                    onClick={() => openDetail(response)}
                    data-testid={`row-response-${response.id}`}
                  >
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className="flex-shrink-0">
                        {response.status === 'suspicious' && <AlertTriangle className="w-5 h-5 text-amber-500" />}
                        {response.status === 'valid' && <CheckCircle className="w-5 h-5 text-green-500" />}
                        {response.status === 'invalid' && <XCircle className="w-5 h-5 text-red-500" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{response.survey.title}</p>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {response.createdAt ? format(new Date(response.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR }) : '-'}
                          </span>
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {response.accuracy?.toFixed(0)}m
                          </span>
                          {response.flagReason && (
                            <span className="text-amber-600 truncate" title={response.flagReason}>
                              {response.flagReason}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={
                        response.status === 'suspicious' ? 'outline' :
                        response.status === 'valid' ? 'default' : 'destructive'
                      }>
                        {response.status === 'suspicious' ? 'Suspeita' :
                         response.status === 'valid' ? 'Válida' : 'Inválida'}
                      </Badge>
                      <Button variant="ghost" size="icon" data-testid={`button-view-${response.id}`}>
                        <Eye className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhes da Entrevista #{selectedResponse?.id}</DialogTitle>
            <DialogDescription>
              Revise as informações e decida se a entrevista é válida
            </DialogDescription>
          </DialogHeader>

          {selectedResponse && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground text-xs">Pesquisa</Label>
                  <p className="font-medium">{selectedResponse.survey.title}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">Data/Hora</Label>
                  <p className="font-medium">
                    {selectedResponse.createdAt ? format(new Date(selectedResponse.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : '-'}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">Duração</Label>
                  <p className="font-medium">{selectedResponse.duration || 0} segundos</p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">Precisão GPS</Label>
                  <p className={`font-medium ${selectedResponse.accuracy > 50 ? 'text-amber-600' : 'text-green-600'}`}>
                    {selectedResponse.accuracy?.toFixed(1)}m
                  </p>
                </div>
              </div>

              <div className="p-4 bg-muted rounded-lg">
                <Label className="text-muted-foreground text-xs">Coordenadas</Label>
                <p className="font-mono text-sm">
                  {selectedResponse.latitude?.toFixed(6)}, {selectedResponse.longitude?.toFixed(6)}
                </p>
                <a
                  href={`https://www.google.com/maps?q=${selectedResponse.latitude},${selectedResponse.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary text-sm underline"
                >
                  Ver no Google Maps
                </a>
              </div>

              {selectedResponse.flagReason && (
                <div className="p-4 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <div className="flex items-center gap-2 text-amber-600">
                    <AlertTriangle className="w-4 h-4" />
                    <Label className="font-medium">Motivo da Suspeita</Label>
                  </div>
                  <p className="mt-1 text-sm">{selectedResponse.flagReason}</p>
                </div>
              )}

              {selectedResponse.audioUrl && (
                <div>
                  <Label className="text-muted-foreground text-xs">Gravação de Áudio</Label>
                  <div className="mt-2 p-3 bg-muted rounded-lg flex items-center gap-3">
                    <FileAudio className="w-5 h-5 text-muted-foreground" />
                    <audio controls className="flex-1" data-testid="audio-player">
                      <source src={`/api/uploads/serve/${encodeURIComponent(selectedResponse.audioUrl)}`} type="audio/webm" />
                      Seu navegador não suporta o elemento de áudio.
                    </audio>
                  </div>
                </div>
              )}

              <div>
                <Label htmlFor="reviewNote">Nota de Revisão (opcional)</Label>
                <Textarea
                  id="reviewNote"
                  placeholder="Adicione uma observação sobre sua decisão..."
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  data-testid="input-review-note"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDetailDialogOpen(false)}>
              Cancelar
            </Button>
            {selectedResponse?.status === 'suspicious' && (
              <>
                <Button
                  variant="destructive"
                  onClick={() => selectedResponse && handleReject(selectedResponse.id)}
                  disabled={updateStatus.isPending}
                  data-testid="button-reject"
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Invalidar
                </Button>
                <Button
                  onClick={() => selectedResponse && handleApprove(selectedResponse.id)}
                  disabled={updateStatus.isPending}
                  data-testid="button-approve"
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Aprovar
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
