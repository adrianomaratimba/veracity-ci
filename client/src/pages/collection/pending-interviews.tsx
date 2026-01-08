import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Cloud, 
  CloudOff, 
  Trash2, 
  RefreshCw, 
  ArrowLeft, 
  Clock,
  CheckCircle,
  AlertTriangle,
  Loader2,
  WifiOff,
  BarChart3
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { 
  getPendingInterviews, 
  deletePendingInterview,
  resetAllRetries,
  type PendingInterview 
} from "@/lib/offlineStorage";
import { syncAllPending } from "@/lib/syncQueue";

export default function PendingInterviews() {
  const { toast } = useToast();
  const [interviews, setInterviews] = useState<PendingInterview[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    loadInterviews();
    
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const loadInterviews = async () => {
    setIsLoading(true);
    try {
      const pending = await getPendingInterviews();
      setInterviews(pending.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ));
    } catch (error) {
      toast({
        title: "Erro",
        description: "Não foi possível carregar as entrevistas pendentes.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSync = async () => {
    if (!isOnline) {
      toast({
        title: "Sem conexão",
        description: "Aguarde a conexão ser restaurada para sincronizar.",
        variant: "destructive"
      });
      return;
    }

    setIsSyncing(true);
    try {
      await resetAllRetries();
      await loadInterviews();
      
      const result = await syncAllPending();
      await loadInterviews();
      
      if (result.synced > 0) {
        toast({
          title: "Sincronização concluída",
          description: `${result.synced} entrevista(s) enviada(s) com sucesso.`,
        });
      }
      if (result.failed > 0) {
        toast({
          title: "Algumas falhas",
          description: `${result.failed} entrevista(s) não puderam ser enviadas.`,
          variant: "destructive"
        });
      }
      if (result.synced === 0 && result.failed === 0) {
        toast({
          title: "Nada para sincronizar",
          description: "Todas as entrevistas já foram enviadas.",
        });
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta entrevista? Esta ação não pode ser desfeita.")) {
      return;
    }
    
    try {
      await deletePendingInterview(id);
      await loadInterviews();
      toast({
        title: "Entrevista excluída",
        description: "A entrevista foi removida do armazenamento local.",
      });
    } catch (error) {
      toast({
        title: "Erro",
        description: "Não foi possível excluir a entrevista.",
        variant: "destructive"
      });
    }
  };

  const handleClearAll = async () => {
    if (!confirm("Tem certeza que deseja excluir TODAS as entrevistas pendentes? Esta ação não pode ser desfeita e os dados serão perdidos.")) {
      return;
    }
    
    try {
      for (const interview of interviews) {
        await deletePendingInterview(interview.id);
      }
      await loadInterviews();
      toast({
        title: "Entrevistas removidas",
        description: "Todas as entrevistas pendentes foram excluídas.",
      });
    } catch (error) {
      toast({
        title: "Erro",
        description: "Não foi possível excluir as entrevistas.",
        variant: "destructive"
      });
    }
  };

  const getStatusBadge = (interview: PendingInterview) => {
    switch (interview.status) {
      case 'pending':
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" /> Pendente</Badge>;
      case 'syncing':
        return <Badge><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Sincronizando</Badge>;
      case 'failed':
        return <Badge variant="destructive"><AlertTriangle className="w-3 h-3 mr-1" /> Falhou ({interview.retryCount}x)</Badge>;
      default:
        return null;
    }
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col">
      <header className="bg-primary text-primary-foreground p-4 sticky top-0 z-10 shadow-md">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button size="icon" variant="ghost" className="text-primary-foreground">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="font-display font-bold text-lg">Entrevistas Pendentes</h1>
            <p className="text-xs opacity-80">
              {interviews.length} entrevista(s) aguardando sincronização
            </p>
          </div>
          {!isOnline && (
            <Badge variant="secondary" className="shrink-0">
              <WifiOff className="w-3 h-3 mr-1" /> Offline
            </Badge>
          )}
          <Link href="/collect/my-performance">
            <Button size="icon" variant="ghost" className="text-primary-foreground" data-testid="button-my-performance">
              <BarChart3 className="w-5 h-5" />
            </Button>
          </Link>
        </div>
      </header>

      <main className="flex-1 p-4 max-w-md mx-auto w-full space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : interviews.length === 0 ? (
          <Card className="p-8 text-center">
            <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <h2 className="text-xl font-bold mb-2">Tudo sincronizado!</h2>
            <p className="text-muted-foreground text-sm">
              Não há entrevistas pendentes de envio.
            </p>
          </Card>
        ) : (
          <>
            <div className="flex gap-2">
              <Button 
                className="flex-1" 
                onClick={handleSync}
                disabled={isSyncing || !isOnline}
                data-testid="button-sync-all"
              >
                {isSyncing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Sincronizando...
                  </>
                ) : (
                  <>
                    <Cloud className="w-4 h-4 mr-2" />
                    Sincronizar ({interviews.filter(i => i.status !== 'syncing').length})
                  </>
                )}
              </Button>
              <Button 
                variant="destructive"
                onClick={handleClearAll}
                disabled={isSyncing}
                data-testid="button-clear-all"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Limpar
              </Button>
            </div>

            <div className="space-y-3">
              {interviews.map((interview) => (
                <Card key={interview.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        {getStatusBadge(interview)}
                        <span className="text-xs text-muted-foreground">
                          Pesquisa #{interview.surveyId}
                        </span>
                      </div>
                      <p className="text-sm font-medium truncate">
                        {interview.data.answers.length} respostas
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Criada em {formatDate(interview.createdAt)}
                      </p>
                      {interview.errorMessage && (
                        <p className="text-xs text-destructive mt-1">
                          Erro: {interview.errorMessage}
                        </p>
                      )}
                    </div>
                    <Button 
                      size="icon" 
                      variant="ghost"
                      onClick={() => handleDelete(interview.id)}
                      data-testid={`button-delete-${interview.id}`}
                    >
                      <Trash2 className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
