import { useState, useEffect, useRef } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import {
  MessageSquare, Send, Bell, BellOff, Loader2, Users, RefreshCw
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

function getInitials(name: string) {
  return name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase() || '?';
}

function formatTime(d: string | Date | null | undefined) {
  if (!d) return '';
  const date = new Date(d);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  return isToday
    ? format(date, 'HH:mm', { locale: ptBR })
    : format(date, "dd/MM HH:mm", { locale: ptBR });
}

// ---- Push notification subscription ----
function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return new Uint8Array([...rawData].map(c => c.charCodeAt(0)));
}

function usePushSubscription() {
  const { toast } = useToast();
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    fetch('/api/push/personal/status', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setIsSubscribed(d.subscribed || false))
      .catch(() => {});
  }, []);

  async function subscribe() {
    setIsProcessing(true);
    try {
      const statusRes = await fetch('/api/push/personal/status', { credentials: 'include' });
      const { publicKey } = await statusRes.json();
      if (!publicKey) return toast({ title: "Push não configurado", variant: "destructive" });
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        return toast({ title: "Notificações não suportadas neste navegador", variant: "destructive" });
      }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        return toast({ title: "Permissão negada", description: "Habilite notificações nas configurações do navegador.", variant: "destructive" });
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      await apiRequest("POST", "/api/push/personal/subscribe", { subscription: sub.toJSON() });
      setIsSubscribed(true);
      toast({ title: "✅ Notificações de mensagens ativadas!" });
    } catch (err: any) {
      toast({ title: "Erro ao ativar notificações", description: err.message, variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  }

  async function unsubscribe() {
    setIsProcessing(true);
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) await sub.unsubscribe();
      }
      await apiRequest("DELETE", "/api/push/personal/subscribe");
      setIsSubscribed(false);
      toast({ title: "Notificações desativadas" });
    } catch {
      toast({ title: "Erro", variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  }

  return { isSubscribed, isProcessing, subscribe, unsubscribe };
}

// ---- Conversation view ----
function ConversationView({ orgId, otherUserId, otherUserName, currentUserId }: {
  orgId: number;
  otherUserId: string;
  otherUserName: string;
  currentUserId: string;
}) {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: msgs = [], isLoading } = useQuery({
    queryKey: ['/api/organizations', orgId, 'messages', otherUserId],
    queryFn: async () => {
      const res = await fetch(`/api/organizations/${orgId}/messages/${otherUserId}`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!orgId && !!otherUserId,
    refetchInterval: 5000,
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs]);

  useEffect(() => {
    qc.invalidateQueries({ queryKey: ['/api/organizations', orgId, 'messages'] });
    qc.invalidateQueries({ queryKey: ['/api/messages/unread-count'] });
  }, [msgs.length]);

  const sendMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await apiRequest("POST", `/api/organizations/${orgId}/messages/${otherUserId}`, { content });
      return res.json();
    },
    onSuccess: () => {
      setInput('');
      qc.invalidateQueries({ queryKey: ['/api/organizations', orgId, 'messages', otherUserId] });
      qc.invalidateQueries({ queryKey: ['/api/organizations', orgId, 'messages'] });
    },
    onError: () => toast({ title: "Erro ao enviar mensagem", variant: "destructive" }),
  });

  function handleSend() {
    const content = input.trim();
    if (!content) return;
    sendMutation.mutate(content);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  if (isLoading) return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 p-4 border-b bg-card">
        <Avatar className="h-9 w-9">
          <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
            {getInitials(otherUserName)}
          </AvatarFallback>
        </Avatar>
        <div>
          <p className="font-semibold text-sm">{otherUserName}</p>
          <p className="text-xs text-muted-foreground">Entrevistadora</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {msgs.length === 0 && (
          <div className="text-center text-muted-foreground text-sm py-8">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
            Nenhuma mensagem ainda. Envie a primeira!
          </div>
        )}
        {msgs.map((msg: any) => {
          const isMine = msg.fromUserId === currentUserId;
          return (
            <div key={msg.id} className={cn("flex", isMine ? "justify-end" : "justify-start")}
              data-testid={`message-${msg.id}`}>
              <div className={cn(
                "max-w-[75%] px-3 py-2 rounded-2xl text-sm shadow-sm",
                isMine
                  ? "bg-primary text-primary-foreground rounded-br-sm"
                  : "bg-muted text-foreground rounded-bl-sm"
              )}>
                <p>{msg.content}</p>
                <p className={cn("text-xs mt-1", isMine ? "text-primary-foreground/70 text-right" : "text-muted-foreground")}>
                  {formatTime(msg.createdAt)}
                  {isMine && msg.readAt && <span className="ml-1">✓✓</span>}
                  {isMine && !msg.readAt && <span className="ml-1">✓</span>}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="p-4 border-t bg-card">
        <div className="flex items-center gap-2">
          <Input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escreva uma mensagem..."
            className="flex-1"
            disabled={sendMutation.isPending}
            data-testid="input-message"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={sendMutation.isPending || !input.trim()}
            data-testid="button-send-message"
          >
            {sendMutation.isPending
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---- Main Page ----
export default function MessagesPage() {
  const params = useParams<{ orgId: string }>();
  const orgId = parseInt(params.orgId || "0");
  const { user } = useAuth();
  const currentUserId = user?.id || '';
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedUserName, setSelectedUserName] = useState('');
  const { isSubscribed, isProcessing, subscribe, unsubscribe } = usePushSubscription();

  // Get team members to start new conversations
  const { data: members = [] } = useQuery({
    queryKey: ['/api/organizations', orgId, 'members'],
    queryFn: async () => {
      const res = await fetch(`/api/organizations/${orgId}/members`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!orgId,
  });

  // Get conversations list
  const { data: conversations = [], isLoading: loadingConvs, refetch } = useQuery({
    queryKey: ['/api/organizations', orgId, 'messages'],
    queryFn: async () => {
      const res = await fetch(`/api/organizations/${orgId}/messages`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!orgId,
    refetchInterval: 10000,
  });

  // Other members (excluding self) that haven't been messaged yet
  const conversedIds = new Set(conversations.map((c: any) => c.otherUserId));
  const otherMembers = members.filter((m: any) => m.userId !== currentUserId && !conversedIds.has(m.userId));

  function openConversation(userId: string, userName: string) {
    setSelectedUserId(userId);
    setSelectedUserName(userName);
  }

  return (
    <DashboardLayout orgId={params.orgId}>
      <div className="h-[calc(100vh-8rem)] md:h-[calc(100vh-4rem)] flex flex-col gap-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold font-display">Mensagens</h1>
              <p className="text-sm text-muted-foreground">Comunicação com a equipe de campo</p>
            </div>
          </div>
          <Button
            variant={isSubscribed ? "outline" : "default"}
            size="sm"
            onClick={isSubscribed ? unsubscribe : subscribe}
            disabled={isProcessing}
            data-testid="button-push-messages-toggle"
          >
            {isProcessing
              ? <Loader2 className="w-4 h-4 animate-spin mr-2" />
              : isSubscribed
                ? <Bell className="w-4 h-4 mr-2" />
                : <BellOff className="w-4 h-4 mr-2" />}
            {isSubscribed ? 'Notificações ativas' : 'Ativar notificações'}
          </Button>
        </div>

        <div className="flex-1 flex gap-4 min-h-0">
          {/* Conversation List */}
          <div className="w-72 shrink-0 flex flex-col border rounded-xl bg-card overflow-hidden">
            <div className="p-3 border-b flex items-center justify-between">
              <p className="text-sm font-semibold">Conversas</p>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => refetch()}>
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {loadingConvs && conversations.length === 0 && (
                <div className="flex justify-center p-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
              )}
              {conversations.map((conv: any) => (
                <button
                  key={conv.otherUserId}
                  onClick={() => openConversation(conv.otherUserId, conv.otherUserName)}
                  className={cn(
                    "w-full text-left px-3 py-3 hover:bg-muted/50 transition-colors border-b last:border-0 flex items-center gap-3",
                    selectedUserId === conv.otherUserId && "bg-primary/5"
                  )}
                  data-testid={`conv-item-${conv.otherUserId}`}
                >
                  <Avatar className="h-9 w-9 shrink-0">
                    <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                      {getInitials(conv.otherUserName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium truncate">{conv.otherUserName}</p>
                      <span className="text-xs text-muted-foreground shrink-0 ml-1">{formatTime(conv.lastAt)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground truncate">{conv.lastMessage}</p>
                      {conv.unreadCount > 0 && (
                        <Badge className="text-xs h-5 min-w-5 px-1.5 ml-1 shrink-0 bg-primary">
                          {conv.unreadCount}
                        </Badge>
                      )}
                    </div>
                  </div>
                </button>
              ))}

              {/* New conversation - members not yet messaged */}
              {otherMembers.length > 0 && (
                <>
                  <div className="px-3 py-2 bg-muted/30">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                      <Users className="w-3 h-3" /> Nova conversa
                    </p>
                  </div>
                  {otherMembers.map((m: any) => {
                    const name = [m.user?.firstName, m.user?.lastName].filter(Boolean).join(' ') || m.user?.email || m.userId;
                    return (
                      <button
                        key={m.userId}
                        onClick={() => openConversation(m.userId, name)}
                        className={cn(
                          "w-full text-left px-3 py-3 hover:bg-muted/50 transition-colors border-b last:border-0 flex items-center gap-3",
                          selectedUserId === m.userId && "bg-primary/5"
                        )}
                        data-testid={`new-conv-${m.userId}`}
                      >
                        <Avatar className="h-9 w-9 shrink-0">
                          <AvatarFallback className="bg-muted text-muted-foreground text-xs font-bold">
                            {getInitials(name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{name}</p>
                          <p className="text-xs text-muted-foreground">{m.role}</p>
                        </div>
                      </button>
                    );
                  })}
                </>
              )}

              {conversations.length === 0 && otherMembers.length === 0 && !loadingConvs && (
                <div className="text-center p-6 text-muted-foreground">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Nenhuma conversa ainda.</p>
                  <p className="text-xs mt-1">Adicione membros à equipe para começar.</p>
                </div>
              )}
            </div>
          </div>

          {/* Conversation Panel */}
          <div className="flex-1 border rounded-xl bg-card overflow-hidden min-h-0">
            {selectedUserId ? (
              <ConversationView
                orgId={orgId}
                otherUserId={selectedUserId}
                otherUserName={selectedUserName}
                currentUserId={currentUserId}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
                <MessageSquare className="w-12 h-12 opacity-30" />
                <p className="text-sm">Selecione uma conversa para começar</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
