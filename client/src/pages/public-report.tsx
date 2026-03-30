import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from "recharts";
import { MapPin, Calendar, Users, Activity, AlertTriangle } from "lucide-react";

const CHART_COLORS = [
  '#3b82f6', '#ef4444', '#22c55e', '#eab308', '#a855f7',
  '#06b6d4', '#f97316', '#6366f1', '#10b981', '#f59e0b'
];

interface PublicResult {
  survey: {
    title: string;
    location?: string;
    status: string;
    targetSample?: number;
    marginOfError?: number;
    startDate?: string;
    endDate?: string;
  };
  totalResponses: number;
  validResponses: number;
  collectionPeriod?: { start: string; end: string };
  questionResults: Array<{
    questionId: number;
    questionText: string;
    questionType: string;
    results: Array<{ option: string; count: number; percentage: number }>;
  }>;
}

export default function PublicReportPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const { data, isLoading, isError, error } = useQuery<PublicResult>({
    queryKey: ['/api/public', token],
    queryFn: async () => {
      const res = await fetch(`/api/public/${token}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `Erro ${res.status}`);
      }
      return res.json();
    },
    enabled: !!token,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-slate-600 text-sm">Carregando resultados...</p>
        </div>
      </div>
    );
  }

  if (isError || !data) {
    const msg = (error as Error)?.message || '';
    const isExpired = msg.toLowerCase().includes('expirado');
    const isNotFound = msg.toLowerCase().includes('inválido') || msg.toLowerCase().includes('não encontrado');
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-10 pb-8 space-y-3">
            <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto" />
            <h2 className="text-xl font-bold text-slate-800">
              {isExpired ? 'Link expirado' : isNotFound ? 'Link inválido' : 'Acesso negado'}
            </h2>
            <p className="text-slate-500 text-sm">
              {isExpired
                ? 'Este link de acesso expirou. Solicite um novo link ao responsável pela pesquisa.'
                : isNotFound
                  ? 'O link que você acessou não existe ou foi removido.'
                  : 'Não foi possível carregar os resultados. Verifique o link e tente novamente.'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { survey, totalResponses, validResponses, collectionPeriod, questionResults } = data;
  const realtimeMOE = totalResponses >= 2
    ? Math.round((98 / Math.sqrt(totalResponses)) * 10) / 10
    : null;

  const voteQuestion = questionResults.find(q =>
    q.questionText.toLowerCase().includes('voto') ||
    q.questionText.toLowerCase().includes('candidato') ||
    q.questionText.toLowerCase().includes('prefeito') ||
    q.questionText.toLowerCase().includes('governador') ||
    q.questionText.toLowerCase().includes('presidente')
  ) || questionResults[0];
  const otherQuestions = questionResults.filter(q => q.questionId !== voteQuestion?.questionId);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-gradient-to-br from-slate-900 to-blue-900 text-white">
        <div className="max-w-4xl mx-auto px-4 py-10">
          <p className="text-blue-300 text-xs font-semibold uppercase tracking-widest mb-2">
            Relatório de Pesquisa Eleitoral
          </p>
          <h1 className="text-3xl font-bold mb-2">{survey.title}</h1>
          <div className="flex flex-wrap items-center gap-4 text-sm text-blue-200 mt-3">
            {survey.location && (
              <span className="flex items-center gap-1">
                <MapPin className="w-4 h-4" /> {survey.location}
              </span>
            )}
            {collectionPeriod && (
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {new Date(collectionPeriod.start).toLocaleDateString('pt-BR')} a {new Date(collectionPeriod.end).toLocaleDateString('pt-BR')}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-4 h-4 text-blue-600" />
                <span className="text-xs text-slate-500 uppercase tracking-wide">Entrevistas</span>
              </div>
              <p className="text-2xl font-bold text-slate-800" data-testid="text-public-total">{totalResponses}</p>
              <p className="text-xs text-slate-500">{validResponses} válidas</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <Activity className="w-4 h-4 text-blue-600" />
                <span className="text-xs text-slate-500 uppercase tracking-wide">Margem</span>
              </div>
              <p className="text-2xl font-bold text-blue-600">
                {realtimeMOE != null ? `±${realtimeMOE}%` : 'N/D'}
              </p>
              <p className="text-xs text-slate-500">IC 95%</p>
            </CardContent>
          </Card>
          {survey.targetSample && (
            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-slate-500 uppercase tracking-wide">Progresso</span>
                </div>
                <p className="text-2xl font-bold text-slate-800">
                  {Math.min(100, Math.round((totalResponses / survey.targetSample) * 100))}%
                </p>
                <p className="text-xs text-slate-500">da meta de {survey.targetSample}</p>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-slate-500 uppercase tracking-wide">Status</span>
              </div>
              <Badge variant={survey.status === 'active' ? 'default' : 'secondary'} className="mt-1">
                {survey.status === 'active' ? 'Em campo' :
                 survey.status === 'completed' ? 'Concluída' :
                 survey.status === 'paused' ? 'Pausada' : survey.status}
              </Badge>
            </CardContent>
          </Card>
        </div>

        {/* Main vote intention chart */}
        {voteQuestion && voteQuestion.results.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Resultado Principal</CardTitle>
              <CardDescription>{voteQuestion.questionText}</CardDescription>
            </CardHeader>
            <CardContent>
              <div style={{ height: Math.max(250, voteQuestion.results.length * 52) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={[...voteQuestion.results].sort((a, b) => b.percentage - a.percentage)}
                    layout="vertical"
                    margin={{ top: 4, right: 60, left: 8, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.4} />
                    <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} />
                    <YAxis
                      type="category"
                      dataKey="option"
                      width={160}
                      tick={{ fontSize: 12 }}
                    />
                    <Tooltip formatter={(v: number) => `${v}%`} />
                    <Bar dataKey="percentage" name="%" radius={[0, 4, 4, 0]} label={{ position: 'right', formatter: (v: number) => `${v}%`, fontSize: 12, fontWeight: 600 }}>
                      {[...voteQuestion.results]
                        .sort((a, b) => b.percentage - a.percentage)
                        .map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Other questions */}
        {otherQuestions.map(q => (
          <Card key={q.questionId}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{q.questionText}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[...q.results].sort((a, b) => b.percentage - a.percentage).map((r, i) => (
                  <div key={r.option} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-700">{r.option}</span>
                      <span className="font-semibold text-slate-800">{r.percentage}%</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2">
                      <div
                        className="h-2 rounded-full transition-all"
                        style={{ width: `${r.percentage}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}

        <Separator />

        <div className="text-center text-xs text-slate-400 pb-6">
          <p>Dados coletados com GPS e áudio verificados • VotoAudit</p>
          <p className="mt-1">Gerado em {new Date().toLocaleDateString('pt-BR')}</p>
        </div>
      </div>
    </div>
  );
}
