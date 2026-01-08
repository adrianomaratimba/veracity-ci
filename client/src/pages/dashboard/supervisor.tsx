import { useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import { DivIcon } from 'leaflet';
import { RefreshCw, Users, ClipboardList, MapPin, Clock, Activity, Route, Eye, EyeOff } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useState, useEffect, useMemo } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import 'leaflet/dist/leaflet.css';

interface InterviewerData {
  userId: string;
  name: string;
  email: string | null;
  profileImageUrl: string | null;
  lastLocation: { lat: number; lng: number } | null;
  lastActivity: string | null;
  currentSurvey: { id: number; title: string } | null;
  interviewsToday: number;
  interviewsTotal: number;
  status: 'active' | 'idle' | 'offline';
}

interface RealtimeInterviewer {
  userId: string;
  name: string;
  email: string | null;
  profileImageUrl: string | null;
  isOnline: boolean;
  lastLocation: { lat: number; lng: number; time: string } | null;
  currentSurvey: { id: number; title: string } | null;
  distanceToday: number;
}

interface SupervisorOverview {
  interviewers: InterviewerData[];
  totalInterviewsToday: number;
  activeInterviewers: number;
}

interface RoutePoint {
  lat: number;
  lng: number;
  time: string;
}

function useSupervisorOverview(orgId: number, refetchInterval: number = 30000) {
  return useQuery<SupervisorOverview>({
    queryKey: ['/api/organizations', orgId, 'supervisor', 'overview'],
    queryFn: async () => {
      const res = await fetch(`/api/organizations/${orgId}/supervisor/overview`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch supervisor overview");
      return res.json();
    },
    refetchInterval,
    staleTime: 10000,
    enabled: !!orgId,
  });
}

function useRealtimeInterviewers(orgId: number, refetchInterval: number = 15000) {
  return useQuery<RealtimeInterviewer[]>({
    queryKey: ['/api/organizations', orgId, 'tracking', 'interviewers'],
    queryFn: async () => {
      const res = await fetch(`/api/organizations/${orgId}/tracking/interviewers`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch realtime interviewers");
      return res.json();
    },
    refetchInterval,
    staleTime: 5000,
    enabled: !!orgId,
  });
}

function useInterviewerRoute(orgId: number, userId: string | null, date?: Date) {
  return useQuery<{ route: RoutePoint[]; totalDistance: number }>({
    queryKey: ['/api/organizations', orgId, 'tracking', 'route', userId, date?.toISOString()],
    queryFn: async () => {
      const dateParam = date ? `?date=${date.toISOString().split('T')[0]}` : '';
      const res = await fetch(`/api/organizations/${orgId}/tracking/route/${userId}${dateParam}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch route");
      return res.json();
    },
    enabled: !!orgId && !!userId,
    staleTime: 30000,
  });
}

function getStatusColor(isOnline: boolean) {
  return isOnline ? 'bg-green-500' : 'bg-gray-400';
}

function getStatusLabel(isOnline: boolean) {
  return isOnline ? 'Online' : 'Offline';
}

function createMarkerIcon(isOnline: boolean) {
  const color = isOnline ? '#22c55e' : '#9ca3af';
  return new DivIcon({
    html: `<div style="background-color: ${color}; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
    className: '',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(2)} km`;
}

function InterviewerListItem({ 
  interviewer, 
  isSelected, 
  onToggle,
  showRoute,
  onToggleRoute
}: { 
  interviewer: RealtimeInterviewer; 
  isSelected: boolean;
  onToggle: () => void;
  showRoute: boolean;
  onToggleRoute: () => void;
}) {
  const initials = interviewer.name
    .split(' ')
    .map(n => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  return (
    <div 
      className={`flex items-center gap-3 p-3 rounded-lg border ${isSelected ? 'border-primary bg-primary/5' : 'border-transparent'}`}
      data-testid={`card-interviewer-${interviewer.userId}`}
    >
      <Checkbox 
        checked={isSelected} 
        onCheckedChange={onToggle}
        data-testid={`checkbox-interviewer-${interviewer.userId}`}
      />
      <div className="relative">
        <Avatar className="h-8 w-8">
          <AvatarImage src={interviewer.profileImageUrl || undefined} />
          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
        </Avatar>
        <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background ${getStatusColor(interviewer.isOnline)}`} />
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{interviewer.name}</span>
          <Badge variant="outline" className="text-xs shrink-0">
            {getStatusLabel(interviewer.isOnline)}
          </Badge>
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
          {interviewer.distanceToday > 0 && (
            <span className="flex items-center gap-1">
              <Route className="w-3 h-3" />
              {formatDistance(interviewer.distanceToday)}
            </span>
          )}
          {interviewer.lastLocation && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDistanceToNow(new Date(interviewer.lastLocation.time), { addSuffix: true, locale: ptBR })}
            </span>
          )}
        </div>
      </div>

      {interviewer.lastLocation && (
        <Button
          size="icon"
          variant={showRoute ? "default" : "ghost"}
          onClick={onToggleRoute}
          title={showRoute ? "Ocultar rota" : "Mostrar rota"}
          data-testid={`button-route-${interviewer.userId}`}
        >
          {showRoute ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </Button>
      )}
    </div>
  );
}

const routeColors = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

export default function SupervisorDashboard({ params }: { params: { orgId: string } }) {
  const orgId = parseInt(params.orgId);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [selectedInterviewers, setSelectedInterviewers] = useState<Set<string>>(new Set());
  const [routesVisible, setRoutesVisible] = useState<Set<string>>(new Set());
  
  const { data: overviewData, isLoading: overviewLoading, refetch: refetchOverview, isFetching: isFetchingOverview } = useSupervisorOverview(orgId);
  const { data: realtimeData, isLoading: realtimeLoading, refetch: refetchRealtime, isFetching: isFetchingRealtime } = useRealtimeInterviewers(orgId);

  const isFetching = isFetchingOverview || isFetchingRealtime;
  const isLoading = overviewLoading || realtimeLoading;

  useEffect(() => {
    if (!isFetching) {
      setLastRefresh(new Date());
    }
  }, [isFetching]);

  const handleManualRefresh = () => {
    refetchOverview();
    refetchRealtime();
  };

  const toggleInterviewer = (userId: string) => {
    setSelectedInterviewers(prev => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const toggleRoute = (userId: string) => {
    setRoutesVisible(prev => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const selectAll = () => {
    if (realtimeData) {
      setSelectedInterviewers(new Set(realtimeData.map(i => i.userId)));
    }
  };

  const deselectAll = () => {
    setSelectedInterviewers(new Set());
    setRoutesVisible(new Set());
  };

  const displayedInterviewers = useMemo(() => {
    if (!realtimeData) return [];
    if (selectedInterviewers.size === 0) return realtimeData;
    return realtimeData.filter(i => selectedInterviewers.has(i.userId));
  }, [realtimeData, selectedInterviewers]);

  const interviewersWithLocation = useMemo(() => {
    return displayedInterviewers.filter(i => i.lastLocation);
  }, [displayedInterviewers]);

  const defaultCenter: [number, number] = useMemo(() => {
    if (interviewersWithLocation.length > 0) {
      return [interviewersWithLocation[0].lastLocation!.lat, interviewersWithLocation[0].lastLocation!.lng];
    }
    return [-15.7801, -47.9292];
  }, [interviewersWithLocation]);

  const totalDistanceToday = useMemo(() => {
    if (!realtimeData) return 0;
    return realtimeData.reduce((sum, i) => sum + (i.distanceToday || 0), 0);
  }, [realtimeData]);

  const onlineCount = useMemo(() => {
    if (!realtimeData) return 0;
    return realtimeData.filter(i => i.isOnline).length;
  }, [realtimeData]);

  if (isLoading) return <LoadingScreen message="Carregando dashboard do supervisor..." />;

  return (
    <DashboardLayout orgId={params.orgId}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-display font-bold">Supervisor</h1>
            <p className="text-muted-foreground">Acompanhamento em tempo real dos entrevistadores em campo</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs text-muted-foreground">
              Atualizado {formatDistanceToNow(lastRefresh, { addSuffix: true, locale: ptBR })}
            </span>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleManualRefresh} 
              disabled={isFetching}
              data-testid="button-refresh-supervisor"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Online Agora</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-full">
                  <Users className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <span className="text-2xl font-bold" data-testid="text-online-interviewers">
                  {onlineCount}
                </span>
                <span className="text-muted-foreground text-sm">
                  / {realtimeData?.length ?? 0}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Entrevistas Hoje</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-full">
                  <ClipboardList className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <span className="text-2xl font-bold" data-testid="text-interviews-today">
                  {overviewData?.totalInterviewsToday ?? 0}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Com Localização</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-full">
                  <MapPin className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <span className="text-2xl font-bold" data-testid="text-with-location">
                  {interviewersWithLocation.length}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Distância Total Hoje</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-full">
                  <Route className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                </div>
                <span className="text-2xl font-bold" data-testid="text-total-distance">
                  {formatDistance(totalDistanceToday)}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-lg">Mapa em Tempo Real</CardTitle>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <span>Online</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full bg-gray-400" />
                  <span>Offline</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="h-[500px]">
                <MapContainer
                  center={defaultCenter}
                  zoom={interviewersWithLocation.length > 0 ? 10 : 4}
                  style={{ height: '100%', width: '100%' }}
                  scrollWheelZoom={true}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  {interviewersWithLocation.map((interviewer, idx) => (
                    <Marker
                      key={interviewer.userId}
                      position={[interviewer.lastLocation!.lat, interviewer.lastLocation!.lng]}
                      icon={createMarkerIcon(interviewer.isOnline)}
                    >
                      <Popup>
                        <div className="text-sm">
                          <strong>{interviewer.name}</strong>
                          <br />
                          <Badge variant="outline" className="mt-1 text-xs">
                            {getStatusLabel(interviewer.isOnline)}
                          </Badge>
                          <br />
                          {interviewer.currentSurvey && (
                            <>
                              <span className="text-muted-foreground">
                                {interviewer.currentSurvey.title}
                              </span>
                              <br />
                            </>
                          )}
                          {interviewer.distanceToday > 0 && (
                            <>
                              <span className="text-muted-foreground">
                                {formatDistance(interviewer.distanceToday)} percorridos
                              </span>
                              <br />
                            </>
                          )}
                          {interviewer.lastLocation && (
                            <span className="text-muted-foreground text-xs">
                              {format(new Date(interviewer.lastLocation.time), "HH:mm:ss", { locale: ptBR })}
                            </span>
                          )}
                        </div>
                      </Popup>
                    </Marker>
                  ))}
                  <RoutePolylines 
                    orgId={orgId} 
                    visibleUserIds={Array.from(routesVisible)} 
                    colors={routeColors}
                  />
                </MapContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-lg">Entrevistadores</CardTitle>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={selectAll} data-testid="button-select-all">
                  Todos
                </Button>
                <Button variant="ghost" size="sm" onClick={deselectAll} data-testid="button-deselect-all">
                  Nenhum
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-2">
              <ScrollArea className="h-[440px]">
                <div className="space-y-1">
                  {realtimeData?.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                      Nenhum entrevistador cadastrado
                    </p>
                  ) : (
                    realtimeData
                      ?.sort((a, b) => {
                        if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
                        return a.name.localeCompare(b.name);
                      })
                      .map(interviewer => (
                        <InterviewerListItem
                          key={interviewer.userId}
                          interviewer={interviewer}
                          isSelected={selectedInterviewers.has(interviewer.userId)}
                          onToggle={() => toggleInterviewer(interviewer.userId)}
                          showRoute={routesVisible.has(interviewer.userId)}
                          onToggleRoute={() => toggleRoute(interviewer.userId)}
                        />
                      ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}

function RoutePolylines({ orgId, visibleUserIds, colors }: { orgId: number; visibleUserIds: string[]; colors: string[] }) {
  return (
    <>
      {visibleUserIds.map((userId, idx) => (
        <SingleRoute key={userId} orgId={orgId} userId={userId} color={colors[idx % colors.length]} />
      ))}
    </>
  );
}

function SingleRoute({ orgId, userId, color }: { orgId: number; userId: string; color: string }) {
  const { data } = useInterviewerRoute(orgId, userId);
  
  if (!data?.route || data.route.length < 2) return null;
  
  const positions: [number, number][] = data.route.map(p => [p.lat, p.lng]);
  
  return (
    <Polyline 
      positions={positions} 
      pathOptions={{ color, weight: 3, opacity: 0.7 }}
    />
  );
}
