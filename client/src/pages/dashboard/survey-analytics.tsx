import { useSurvey, useSurveyAnalytics } from "@/hooks/use-surveys";
import { useResponseList } from "@/hooks/use-responses";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { MapView } from "@/components/analytics/map-view";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';

export default function SurveyAnalytics({ params }: { params: { orgId: string, id: string } }) {
  const surveyId = parseInt(params.id);
  const orgId = parseInt(params.orgId);
  
  const { data: survey, isLoading: surveyLoading } = useSurvey(surveyId);
  const { data: responses, isLoading: responsesLoading } = useResponseList(surveyId);
  
  if (surveyLoading || responsesLoading) return <LoadingScreen message="Processando dados..." />;
  if (!survey || !responses) return <div>Dados não disponíveis</div>;

  // Calculate real metrics from responses
  const totalResponses = responses.length;
  const validResponses = responses.filter(r => r.status === 'valid').length;
  const suspiciousResponses = responses.filter(r => r.status === 'suspicious').length;
  
  const averageDuration = totalResponses > 0 
    ? Math.round(responses.reduce((acc, r) => acc + (r.duration || 0), 0) / totalResponses)
    : 0;
  
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const completionRate = survey.targetSample && survey.targetSample > 0
    ? Math.min(100, Math.round((totalResponses / survey.targetSample) * 100))
    : 100;

  // Generate chart data based on response status
  const statusChartData = [
    { name: 'Válidas', count: validResponses, fill: 'hsl(var(--primary))' },
    { name: 'Suspeitas', count: suspiciousResponses, fill: 'hsl(var(--destructive))' },
  ].filter(d => d.count > 0);

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      'valid': 'Válida',
      'suspicious': 'Suspeita',
      'invalid': 'Inválida'
    };
    return labels[status] || status;
  };

  return (
    <DashboardLayout orgId={params.orgId}>
      <div className="space-y-8">
        <div>
           <h1 className="text-3xl font-display font-bold text-primary">Análise: {survey.title}</h1>
           <p className="text-muted-foreground">Insights em tempo real e trilha de auditoria</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
           <Card>
             <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total de Respostas</CardTitle></CardHeader>
             <CardContent>
               <div className="text-2xl font-bold" data-testid="text-total-responses">{totalResponses}</div>
               {survey.targetSample && (
                 <p className="text-xs text-muted-foreground">Meta: {survey.targetSample}</p>
               )}
             </CardContent>
           </Card>
           <Card>
             <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Taxa de Conclusão</CardTitle></CardHeader>
             <CardContent>
               <div className="text-2xl font-bold" data-testid="text-completion-rate">{completionRate}%</div>
               <div className="w-full bg-muted rounded-full h-1.5 mt-2">
                 <div 
                   className="bg-primary h-1.5 rounded-full transition-all" 
                   style={{ width: `${completionRate}%` }}
                 />
               </div>
             </CardContent>
           </Card>
           <Card>
             <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Duração Média</CardTitle></CardHeader>
             <CardContent>
               <div className="text-2xl font-bold" data-testid="text-avg-duration">{formatDuration(averageDuration)}</div>
               <p className="text-xs text-muted-foreground">Por entrevista</p>
             </CardContent>
           </Card>
           <Card>
             <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Marcadas como Suspeitas</CardTitle></CardHeader>
             <CardContent>
               <div className={`text-2xl font-bold ${suspiciousResponses > 0 ? 'text-destructive' : 'text-green-600'}`} data-testid="text-suspicious">
                 {suspiciousResponses}
               </div>
               {suspiciousResponses > 0 && totalResponses > 0 && (
                 <p className="text-xs text-muted-foreground">
                   {Math.round((suspiciousResponses / totalResponses) * 100)}% do total
                 </p>
               )}
             </CardContent>
           </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
           <Card>
             <CardHeader>
               <CardTitle>Status das Entrevistas</CardTitle>
             </CardHeader>
             <CardContent className="h-[400px]">
               {statusChartData.length > 0 ? (
                 <ResponsiveContainer width="100%" height="100%">
                   <BarChart data={statusChartData}>
                     <CartesianGrid strokeDasharray="3 3" vertical={false} />
                     <XAxis dataKey="name" />
                     <YAxis />
                     <Tooltip 
                       formatter={(value: number) => [`${value} entrevistas`, 'Quantidade']}
                       labelFormatter={(label) => `Status: ${label}`}
                     />
                     <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                   </BarChart>
                 </ResponsiveContainer>
               ) : (
                 <div className="flex items-center justify-center h-full text-muted-foreground">
                   <p>Nenhuma entrevista realizada ainda</p>
                 </div>
               )}
             </CardContent>
           </Card>

           <Card>
             <CardHeader>
               <CardTitle>Cobertura Geográfica</CardTitle>
             </CardHeader>
             <CardContent className="h-[400px] p-0 overflow-hidden rounded-b-xl">
               <MapView responses={responses} height="400px" />
             </CardContent>
           </Card>
        </div>
        
        <Card>
          <CardHeader>
            <CardTitle>Trilha de Auditoria</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted text-muted-foreground uppercase text-xs font-medium">
                  <tr>
                    <th className="px-4 py-3">ID</th>
                    <th className="px-4 py-3">Data/Hora</th>
                    <th className="px-4 py-3">Entrevistador</th>
                    <th className="px-4 py-3">Localização</th>
                    <th className="px-4 py-3">Precisão GPS</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Áudio</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {responses.slice(0, 10).map(resp => (
                    <tr key={resp.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">#{resp.id}</td>
                      <td className="px-4 py-3">{new Date(resp.createdAt!).toLocaleString('pt-BR')}</td>
                      <td className="px-4 py-3">{resp.interviewerId}</td>
                      <td className="px-4 py-3 font-mono text-xs">
                        <a 
                          href={`https://www.google.com/maps?q=${resp.latitude},${resp.longitude}`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          {resp.latitude?.toFixed(6)}, {resp.longitude?.toFixed(6)}
                        </a>
                      </td>
                      <td className="px-4 py-3">{resp.accuracy.toFixed(1)}m</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${
                          resp.status === 'valid' ? 'bg-green-100 text-green-800' : 
                          resp.status === 'suspicious' ? 'bg-yellow-100 text-yellow-800' : 
                          'bg-red-100 text-red-800'
                        }`}>
                          {getStatusLabel(resp.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                         <a href={resp.audioUrl} target="_blank" className="text-blue-600 hover:underline">
                           Ouvir
                         </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
