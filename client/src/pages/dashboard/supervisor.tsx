import { useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { Icon, DivIcon } from 'leaflet';
import { RefreshCw, Users, ClipboardList, MapPin, Clock, Activity } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useState, useEffect } from "react";
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

interface SupervisorOverview {
  interviewers: InterviewerData[];
  totalInterviewsToday: number;
  activeInterviewers: number;
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

function getStatusColor(status: InterviewerData['status']) {
  switch (status) {
    case 'active': return 'bg-green-500';
    case 'idle': return 'bg-yellow-500';
    case 'offline': return 'bg-gray-400';
  }
}

function getStatusLabel(status: InterviewerData['status']) {
  switch (status) {
    case 'active': return 'Ativo';
    case 'idle': return 'Inativo';
    case 'offline': return 'Offline';
  }
}

function createMarkerIcon(status: InterviewerData['status']) {
  const color = status === 'active' ? '#22c55e' : status === 'idle' ? '#eab308' : '#9ca3af';
  return new DivIcon({
    html: `<div style="background-color: ${color}; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
    className: '',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

function InterviewerCard({ interviewer }: { interviewer: InterviewerData }) {
  const initials = interviewer.name
    .split(' ')
    .map(n => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  return (
    <Card className="hover:shadow-md transition-shadow" data-testid={`card-interviewer-${interviewer.userId}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="relative">
            <Avatar className="h-10 w-10">
              <AvatarImage src={interviewer.profileImageUrl || undefined} />
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-background ${getStatusColor(interviewer.status)}`} />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-medium truncate" data-testid={`text-interviewer-name-${interviewer.userId}`}>
                {interviewer.name}
              </h4>
              <Badge variant="outline" className="text-xs">
                {getStatusLabel(interviewer.status)}
              </Badge>
            </div>
            
            {interviewer.currentSurvey && (
              <p className="text-sm text-muted-foreground truncate mt-1">
                <ClipboardList className="w-3 h-3 inline mr-1" />
                {interviewer.currentSurvey.title}
              </p>
            )}
            
            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1">
                <Activity className="w-3 h-3" />
                {interviewer.interviewsToday} hoje
              </span>
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3" />
                {interviewer.interviewsTotal} total
              </span>
              {interviewer.lastActivity && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatDistanceToNow(new Date(interviewer.lastActivity), { addSuffix: true, locale: ptBR })}
                </span>
              )}
            </div>
            
            {interviewer.lastLocation && (
              <p className="text-xs text-muted-foreground mt-1">
                <MapPin className="w-3 h-3 inline mr-1" />
                {interviewer.lastLocation.lat.toFixed(4)}, {interviewer.lastLocation.lng.toFixed(4)}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SupervisorDashboard({ params }: { params: { orgId: string } }) {
  const orgId = parseInt(params.orgId);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const { data, isLoading, refetch, isFetching } = useSupervisorOverview(orgId);

  useEffect(() => {
    if (!isFetching) {
      setLastRefresh(new Date());
    }
  }, [isFetching]);

  const handleManualRefresh = () => {
    refetch();
  };

  if (isLoading) return <LoadingScreen message="Carregando dashboard do supervisor..." />;

  const interviewersWithLocation = data?.interviewers.filter(i => i.lastLocation) || [];
  const defaultCenter: [number, number] = interviewersWithLocation.length > 0
    ? [interviewersWithLocation[0].lastLocation!.lat, interviewersWithLocation[0].lastLocation!.lng]
    : [-15.7801, -47.9292];

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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Entrevistadores Ativos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-full">
                  <Users className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <span className="text-2xl font-bold" data-testid="text-active-interviewers">
                  {data?.activeInterviewers ?? 0}
                </span>
                <span className="text-muted-foreground text-sm">
                  / {data?.interviewers.length ?? 0}
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
                  {data?.totalInterviewsToday ?? 0}
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
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle className="text-lg">Mapa de Atividade</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="h-[400px]">
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
                  {interviewersWithLocation.map(interviewer => (
                    <Marker
                      key={interviewer.userId}
                      position={[interviewer.lastLocation!.lat, interviewer.lastLocation!.lng]}
                      icon={createMarkerIcon(interviewer.status)}
                    >
                      <Popup>
                        <div className="text-sm">
                          <strong>{interviewer.name}</strong>
                          <br />
                          <Badge variant="outline" className="mt-1 text-xs">
                            {getStatusLabel(interviewer.status)}
                          </Badge>
                          <br />
                          {interviewer.currentSurvey && (
                            <span className="text-muted-foreground">
                              {interviewer.currentSurvey.title}
                            </span>
                          )}
                          <br />
                          <span className="text-muted-foreground">
                            {interviewer.interviewsToday} entrevistas hoje
                          </span>
                        </div>
                      </Popup>
                    </Marker>
                  ))}
                </MapContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Entrevistadores</CardTitle>
            </CardHeader>
            <CardContent className="max-h-[400px] overflow-y-auto space-y-3">
              {data?.interviewers.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  Nenhum entrevistador cadastrado
                </p>
              ) : (
                data?.interviewers
                  .sort((a, b) => {
                    const statusOrder = { active: 0, idle: 1, offline: 2 };
                    return statusOrder[a.status] - statusOrder[b.status];
                  })
                  .map(interviewer => (
                    <InterviewerCard key={interviewer.userId} interviewer={interviewer} />
                  ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
