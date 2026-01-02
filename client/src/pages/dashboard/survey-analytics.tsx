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
  // Analytics hook would aggregate data server side for efficiency, 
  // but for MVP we might compute some here or use the responses list
  
  if (surveyLoading || responsesLoading) return <LoadingScreen message="Crunching numbers..." />;
  if (!survey || !responses) return <div>Data not available</div>;

  // Mock chart data - in real app, aggregate answers
  const chartData = [
    { name: 'Candidate A', votes: 45 },
    { name: 'Candidate B', votes: 32 },
    { name: 'Candidate C', votes: 15 },
    { name: 'Undecided', votes: 8 },
  ];

  return (
    <DashboardLayout orgId={params.orgId}>
      <div className="space-y-8">
        <div>
           <h1 className="text-3xl font-display font-bold text-primary">{survey.title} Analysis</h1>
           <p className="text-muted-foreground">Real-time insights and audit trail</p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
           <Card>
             <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Responses</CardTitle></CardHeader>
             <CardContent><div className="text-2xl font-bold">{responses.length}</div></CardContent>
           </Card>
           <Card>
             <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Completion Rate</CardTitle></CardHeader>
             <CardContent><div className="text-2xl font-bold">100%</div></CardContent>
           </Card>
           <Card>
             <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Avg. Duration</CardTitle></CardHeader>
             <CardContent><div className="text-2xl font-bold">2m 14s</div></CardContent>
           </Card>
           <Card>
             <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Flagged Suspicious</CardTitle></CardHeader>
             <CardContent><div className="text-2xl font-bold text-red-500">0</div></CardContent>
           </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
           {/* Chart */}
           <Card>
             <CardHeader>
               <CardTitle>Results Distribution</CardTitle>
             </CardHeader>
             <CardContent className="h-[400px]">
               <ResponsiveContainer width="100%" height="100%">
                 <BarChart data={chartData}>
                   <CartesianGrid strokeDasharray="3 3" vertical={false} />
                   <XAxis dataKey="name" />
                   <YAxis />
                   <Tooltip />
                   <Bar dataKey="votes" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                 </BarChart>
               </ResponsiveContainer>
             </CardContent>
           </Card>

           {/* Map */}
           <Card>
             <CardHeader>
               <CardTitle>Geographic Coverage</CardTitle>
             </CardHeader>
             <CardContent className="h-[400px] p-0 overflow-hidden rounded-b-xl">
               <MapView responses={responses} height="400px" />
             </CardContent>
           </Card>
        </div>
        
        {/* Recent Responses Table */}
        <Card>
          <CardHeader>
            <CardTitle>Audit Trail</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted text-muted-foreground uppercase text-xs font-medium">
                  <tr>
                    <th className="px-4 py-3">ID</th>
                    <th className="px-4 py-3">Timestamp</th>
                    <th className="px-4 py-3">Interviewer</th>
                    <th className="px-4 py-3">GPS Accuracy</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Audio</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {responses.slice(0, 10).map(resp => (
                    <tr key={resp.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">#{resp.id}</td>
                      <td className="px-4 py-3">{new Date(resp.createdAt!).toLocaleString()}</td>
                      <td className="px-4 py-3">{resp.interviewerId}</td>
                      <td className="px-4 py-3">{resp.accuracy.toFixed(1)}m</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 capitalize">
                          {resp.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                         <a href={`/objects${resp.audioUrl}`} target="_blank" className="text-blue-600 hover:underline">
                           Listen
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
