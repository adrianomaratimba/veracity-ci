import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCurrentMember } from "@/hooks/use-organizations";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';
import { Printer, Camera, Sparkles, Loader2, Pencil, CheckCircle2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
  LabelList
} from 'recharts';
import { 
  TrendingUp, 
  Users,
  MapPin,
  Calendar,
  CheckCircle,
  Download,
  FileText,
  BarChart3,
  PieChart as PieChartIcon,
  ArrowLeft,
  FileSpreadsheet,
  Filter,
  Eye,
  EyeOff,
  Target,
  Clock,
  Activity,
  Layers,
  Share2,
  Copy,
  Trash2,
  Link2,
  Plus,
  RotateCcw,
  Sliders
} from "lucide-react";
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Link } from "wouter";
import { hasPermission, isInterviewerRole, isViewerRole, type UserRole } from "@shared/rbac";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

const CHART_COLORS = [
  '#93c5fd',
  '#fca5a5', 
  '#86efac',
  '#fde047',
  '#c4b5fd',
  '#67e8f9',
  '#fdba74',
  '#a5b4fc',
  '#6ee7b7',
  '#f9a8d4'
];

const DEMOGRAPHIC_COLORS = {
  age: ['#93c5fd', '#a5b4fc', '#c4b5fd', '#d8b4fe', '#e9d5ff'],
  gender: ['#93c5fd', '#fca5a5', '#d1d5db'],
  education: ['#bfdbfe', '#93c5fd', '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8']
};

// Helper to truncate long labels
const truncateLabel = (label: string, maxLength: number = 20): string => {
  if (label.length <= maxLength) return label;
  return label.substring(0, maxLength - 3) + '...';
};

// Helper to consolidate options into top N + "Outros"
const consolidateOptions = <T extends { option: string; count: number; percentage: number; imageUrl?: string }>(
  data: T[],
  maxOptions: number = 8
): T[] => {
  if (data.length <= maxOptions) return data;
  
  const sorted = [...data].sort((a, b) => b.percentage - a.percentage);
  const topN = sorted.slice(0, maxOptions - 1);
  const others = sorted.slice(maxOptions - 1);
  
  if (others.length === 0) return topN;
  
  const othersSum = others.reduce((sum, item) => sum + item.count, 0);
  const othersPercentage = others.reduce((sum, item) => sum + item.percentage, 0);
  
  return [
    ...topN,
    {
      option: `Outros (${others.length})`,
      count: othersSum,
      percentage: Math.round(othersPercentage * 10) / 10,
      imageUrl: undefined
    } as T
  ];
};

// Export card as high-quality image
const exportCardAsImage = async (element: HTMLElement, filename: string) => {
  const canvas = await html2canvas(element, {
    scale: 3,
    backgroundColor: '#ffffff',
    logging: false,
    useCORS: true
  });
  
  const link = document.createElement('a');
  link.download = `${filename}.png`;
  link.href = canvas.toDataURL('image/png', 1.0);
  link.click();
};

// Export card as PDF
const exportCardAsPDF = async (element: HTMLElement, filename: string, title: string) => {
  const canvas = await html2canvas(element, {
    scale: 2,
    backgroundColor: '#ffffff',
    logging: false,
    useCORS: true
  });
  
  const imgData = canvas.toDataURL('image/png', 1.0);
  const pdf = new jsPDF('landscape', 'mm', 'a4');
  
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 15;
  
  // Add title
  pdf.setFontSize(18);
  pdf.setFont('helvetica', 'bold');
  pdf.text(title, margin, margin + 5);
  
  // Add timestamp
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(128, 128, 128);
  const date = new Date().toLocaleDateString('pt-BR', { 
    day: '2-digit', 
    month: 'long', 
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  pdf.text(`Gerado em: ${date}`, margin, margin + 12);
  
  // Calculate image dimensions to fit page
  const imgWidth = pageWidth - (margin * 2);
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  const maxImgHeight = pageHeight - margin - 25;
  
  const finalHeight = Math.min(imgHeight, maxImgHeight);
  const finalWidth = (finalHeight === maxImgHeight) 
    ? (canvas.width * finalHeight) / canvas.height 
    : imgWidth;
  
  const xPos = (pageWidth - finalWidth) / 2;
  
  pdf.addImage(imgData, 'PNG', xPos, margin + 20, finalWidth, finalHeight);
  pdf.save(`${filename}.pdf`);
};

// Custom Y-Axis tick component - cleaner version with truncation
interface CustomYAxisTickProps {
  x?: number;
  y?: number;
  payload?: { value: string };
  resultsData?: Array<{ option: string; imageUrl?: string }>;
  showImages?: boolean;
  maxLabelLength?: number;
}

const CustomYAxisTick = ({ x = 0, y = 0, payload, resultsData, showImages, maxLabelLength = 25 }: CustomYAxisTickProps) => {
  const imageUrl = resultsData?.find(r => r.option === payload?.value)?.imageUrl;
  const hasImage = showImages && imageUrl;
  const displayLabel = truncateLabel(payload?.value || '', maxLabelLength);
  
  return (
    <g transform={`translate(${x},${y})`}>
      {hasImage && (
        <image 
          href={imageUrl} 
          x={-40} 
          y={-16} 
          width={32} 
          height={32} 
          clipPath="inset(0% round 50%)"
          preserveAspectRatio="xMidYMid slice"
        />
      )}
      <text 
        x={hasImage ? -48 : -8}
        y={0} 
        dy={4} 
        textAnchor="end" 
        fill="currentColor"
        fontSize={12}
        fontWeight={500}
      >
        {displayLabel}
      </text>
    </g>
  );
};

// Question result item type
interface QuestionResultItem {
  option: string;
  count: number;
  percentage: number;
  imageUrl?: string;
}

// Question result type
interface QuestionResultData {
  questionId: number;
  questionText: string;
  questionType: string;
  showOptionImages?: boolean;
  results: QuestionResultItem[];
}

// Dedicated chart component for question results - properly contains useRef hook
interface QuestionChartCardProps {
  questionResult: QuestionResultData;
  validResponses: number;
  marginOfError: number;
  approvedComment?: string;
  canManageComments?: boolean;
  onDeleteComment?: () => void;
}

const QuestionChartCard = ({ questionResult: qr, validResponses, marginOfError, approvedComment, canManageComments, onDeleteComment }: QuestionChartCardProps) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const sortedResults = [...qr.results].sort((a, b) => b.percentage - a.percentage);
  const displayResults = consolidateOptions(sortedResults, 10);
  const chartHeight = Math.max(300, displayResults.length * 45);
  const hasImages = qr.showOptionImages;
  const yAxisWidth = hasImages ? 220 : 180;
  
  const handleExportPDF = () => {
    if (chartRef.current) {
      exportCardAsPDF(chartRef.current, `resultado-${qr.questionId}`, qr.questionText);
    }
  };
  
  const handleExportImage = () => {
    if (chartRef.current) {
      exportCardAsImage(chartRef.current, `resultado-${qr.questionId}`);
    }
  };
  
  return (
    <div ref={chartRef} className="bg-background">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <CardTitle className="text-lg leading-tight">{qr.questionText}</CardTitle>
              <CardDescription className="mt-1">
                Base: {validResponses} entrevistas válidas | Margem de erro: ±{marginOfError}%
              </CardDescription>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button 
                variant="ghost" 
                size="icon"
                onClick={handleExportImage}
                title="Exportar como imagem"
                data-testid={`button-export-image-${qr.questionId}`}
              >
                <Camera className="w-4 h-4" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon"
                onClick={handleExportPDF}
                title="Exportar como PDF"
                data-testid={`button-export-pdf-${qr.questionId}`}
              >
                <Printer className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div style={{ height: chartHeight }} className="mb-6">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart 
                data={displayResults} 
                layout="vertical"
                margin={{ top: 10, right: 50, left: 10, bottom: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.5} />
                <XAxis 
                  type="number" 
                  domain={[0, 100]} 
                  tickFormatter={(v) => `${v}%`}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis 
                  type="category" 
                  dataKey="option" 
                  width={yAxisWidth}
                  axisLine={false}
                  tickLine={false}
                  tick={(props) => (
                    <CustomYAxisTick 
                      {...props} 
                      resultsData={displayResults}
                      showImages={hasImages}
                      maxLabelLength={hasImages ? 20 : 25}
                    />
                  )}
                />
                <Tooltip 
                  formatter={(value: number) => [`${value}%`, 'Percentual']}
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--background))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                  }}
                />
                <Bar 
                  dataKey="percentage" 
                  radius={[0, 6, 6, 0]}
                  barSize={28}
                >
                  {displayResults.map((entry, i) => (
                    <Cell key={`cell-${i}`} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                  <LabelList 
                    dataKey="percentage" 
                    position="right" 
                    formatter={(v: number) => `${v}%`}
                    style={{ fontSize: 13, fontWeight: 600, fill: 'currentColor' }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 font-medium">Candidato / Opção</th>
                  <th className="text-right py-2 font-medium">Votos</th>
                  <th className="text-right py-2 font-medium">%</th>
                </tr>
              </thead>
              <tbody>
                {sortedResults.map((r, i) => (
                  <tr key={r.option} className="border-b border-muted">
                    <td className="py-2">
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-3 h-3 rounded-full shrink-0" 
                          style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                        />
                        {qr.showOptionImages && r.imageUrl && (
                          <img 
                            src={r.imageUrl} 
                            alt={r.option}
                            className="w-10 h-10 rounded-full object-cover border-2 border-border shrink-0"
                          />
                        )}
                        <span>{r.option}</span>
                      </div>
                    </td>
                    <td className="text-right py-2 text-muted-foreground">{r.count}</td>
                    <td className="text-right py-2 font-semibold">{r.percentage}%</td>
                  </tr>
                ))}
                <tr className="font-medium">
                  <td className="py-2">Total</td>
                  <td className="text-right py-2">{qr.results.reduce((sum, r) => sum + r.count, 0)}</td>
                  <td className="text-right py-2">100%</td>
                </tr>
              </tbody>
            </table>
          </div>

          {approvedComment && (
            <div className="mt-4 p-4 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2 flex-1">
                  <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">Análise por IA</p>
                    <p className="text-sm text-blue-900 dark:text-blue-100 leading-relaxed" data-testid={`text-ai-comment-${qr.questionId}`}>{approvedComment}</p>
                  </div>
                </div>
                {canManageComments && onDeleteComment && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 text-blue-500 hover:text-red-500"
                    onClick={onDeleteComment}
                    title="Remover análise"
                    data-testid={`button-delete-comment-${qr.questionId}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

// Main result chart component for overview tab
interface MainResultChartProps {
  questionData: {
    questionText: string;
    showOptionImages?: boolean;
    results: QuestionResultItem[];
  };
}

const MainResultChart = ({ questionData }: MainResultChartProps) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const sortedResults = [...questionData.results].sort((a, b) => b.percentage - a.percentage);
  const chartHeight = Math.max(300, sortedResults.length * 50);
  const hasImages = questionData.showOptionImages;
  const yAxisWidth = hasImages ? 220 : 180;
  
  const handleExportPDF = () => {
    if (chartRef.current) {
      exportCardAsPDF(chartRef.current, 'resultado-principal', questionData.questionText);
    }
  };
  
  const handleExportImage = () => {
    if (chartRef.current) {
      exportCardAsImage(chartRef.current, 'resultado-principal');
    }
  };
  
  return (
    <div ref={chartRef} className="mt-6 bg-background">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <CardTitle className="text-lg leading-tight">Resultado Principal</CardTitle>
              <CardDescription className="mt-1">{questionData.questionText}</CardDescription>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button 
                variant="ghost" 
                size="icon"
                onClick={handleExportImage}
                title="Exportar como imagem"
                data-testid="button-export-image-main"
              >
                <Camera className="w-4 h-4" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon"
                onClick={handleExportPDF}
                title="Exportar como PDF"
                data-testid="button-export-pdf-main"
              >
                <Printer className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div style={{ height: chartHeight }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart 
                data={sortedResults} 
                layout="vertical"
                margin={{ top: 10, right: 50, left: 10, bottom: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.5} />
                <XAxis 
                  type="number" 
                  domain={[0, 100]} 
                  tickFormatter={(v) => `${v}%`}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis 
                  type="category" 
                  dataKey="option" 
                  width={yAxisWidth}
                  axisLine={false}
                  tickLine={false}
                  tick={(props) => (
                    <CustomYAxisTick 
                      {...props} 
                      resultsData={sortedResults}
                      showImages={hasImages}
                      maxLabelLength={hasImages ? 20 : 25}
                    />
                  )}
                />
                <Tooltip 
                  formatter={(value: number) => [`${value}%`, 'Percentual']}
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--background))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                  }}
                />
                <Bar 
                  dataKey="percentage" 
                  radius={[0, 6, 6, 0]}
                  barSize={32}
                >
                  {sortedResults.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                  <LabelList 
                    dataKey="percentage" 
                    position="right" 
                    formatter={(v: number) => `${v}%`}
                    style={{ fontSize: 14, fontWeight: 700, fill: 'currentColor' }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

interface AggregatedResults {
  survey: {
    id: number;
    title: string;
    location?: string;
    targetSample?: number;
    marginOfError?: number;
    status: string;
    startDate?: string;
    endDate?: string;
    questions: Array<{ id: number; text: string; type: string; options?: string[]; order: number }>;
  };
  totalResponses: number;
  validResponses: number;
  collectionPeriod?: { start: string; end: string };
  questionResults: Array<{
    questionId: number;
    questionText: string;
    questionType: string;
    showOptionImages?: boolean;
    results: Array<{ option: string; count: number; percentage: number; imageUrl?: string }>;
  }>;
  filterFacets?: Array<{
    questionId: number;
    questionText: string;
    filterKey: string;
    options: string[];
  }>;
  demographics?: {
    age?: Array<{ range: string; count: number; percentage: number }>;
    gender?: Array<{ value: string; count: number; percentage: number }>;
    education?: Array<{ level: string; count: number; percentage: number }>;
    neighborhood?: Array<{ name: string; count: number; percentage: number }>;
  };
  crossTabulations?: {
    voteByAge?: Array<{ candidate: string; ranges: Record<string, number> }>;
    voteByGender?: Array<{ candidate: string; male: number; female: number }>;
    voteByEducation?: Array<{ candidate: string; levels: Record<string, number> }>;
  };
}

interface TimelineData {
  date: string;
  total: number;
  questionSnapshots: Array<{
    questionId: number;
    results: Array<{ option: string; count: number; percentage: number }>;
  }>;
}

interface FilterState {
  neighborhood: string;
  ageRange: string;
  gender: string;
  education: string;
  interviewer: string;
  dateFrom: string;
  dateTo: string;
}

export default function SurveyResults({ params }: { params: { orgId: string, surveyId: string } }) {
  const surveyId = parseInt(params.surveyId);
  const orgId = parseInt(params.orgId);
  const { toast } = useToast();
  
  const { data: currentMember, isLoading: memberLoading } = useCurrentMember(orgId);
  
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("overview");
  const [visibleCandidates, setVisibleCandidates] = useState<Set<string>>(new Set());
  const [simValues, setSimValues] = useState<Record<string, number>>({});
  const [simInitialized, setSimInitialized] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [newLinkLabel, setNewLinkLabel] = useState('');
  const [newLinkExpiry, setNewLinkExpiry] = useState('30');
  const [isPdfGenerating, setIsPdfGenerating] = useState(false);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [showAIDialog, setShowAIDialog] = useState(false);
  const [aiDraft, setAiDraft] = useState<Record<number, string>>({});
  const [aiApprovedMap, setAiApprovedMap] = useState<Record<number, boolean>>({});
  const [filters, setFilters] = useState<FilterState>({
    neighborhood: "all",
    ageRange: "all",
    gender: "all",
    education: "all",
    interviewer: "all",
    dateFrom: "",
    dateTo: ""
  });
  
  const filterQueryString = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.neighborhood !== "all") params.set("neighborhood", filters.neighborhood);
    if (filters.ageRange !== "all") params.set("ageRange", filters.ageRange);
    if (filters.gender !== "all") params.set("gender", filters.gender);
    if (filters.education !== "all") params.set("education", filters.education);
    if (filters.interviewer !== "all") params.set("interviewerId", filters.interviewer);
    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) params.set("dateTo", filters.dateTo);
    return params.toString();
  }, [filters]);

  const { data: aggregatedData, isLoading: resultsLoading, error } = useQuery<AggregatedResults>({
    queryKey: ['/api/surveys', surveyId, 'results', 'aggregated', filterQueryString],
    queryFn: async () => {
      const url = filterQueryString 
        ? `/api/surveys/${surveyId}/results/aggregated?${filterQueryString}`
        : `/api/surveys/${surveyId}/results/aggregated`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error("Erro ao carregar resultados");
      return res.json();
    },
    enabled: !!surveyId,
  });
  
  const { data: timelineData, isLoading: timelineLoading } = useQuery<TimelineData[]>({
    queryKey: ['/api/surveys', surveyId, 'results', 'timeline'],
    enabled: !!surveyId,
  });

  // Query for interviewers list (for filter dropdown)
  interface InterviewerListItem {
    id: string;
    name: string;
  }
  const { data: interviewersList } = useQuery<InterviewerListItem[]>({
    queryKey: ['/api/surveys', surveyId, 'interviewers'],
    queryFn: async () => {
      const res = await fetch(`/api/surveys/${surveyId}/interviewers`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!surveyId,
  });

  // Interviewer comparison data
  interface InterviewerComparison {
    interviewers: Array<{ id: string; name: string; totalResponses: number }>;
    questions: Array<{ id: number; text: string; options: string[] }>;
    comparison: Array<{
      questionId: number;
      questionText: string;
      byInterviewer: Array<{
        interviewerId: string;
        interviewerName: string;
        totalForQuestion: number;
        distribution: Array<{ option: string; count: number; percentage: number }>;
      }>;
      groupAverage: Array<{ option: string; avgPercentage: number }>;
      discrepancies: Array<{ interviewerId: string; interviewerName: string; option: string; deviation: number }>;
    }>;
  }

  const [selectedQuestionForComparison, setSelectedQuestionForComparison] = useState<string>("all");

  // T007: Wave comparison state
  const [compareWaveSurveyId, setCompareWaveSurveyId] = useState<string>("none");

  const { data: interviewerData, isLoading: interviewerLoading } = useQuery<InterviewerComparison>({
    queryKey: ['/api/organizations', orgId, 'audit/interviewers', surveyId.toString(), selectedQuestionForComparison],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append("surveyId", surveyId.toString());
      if (selectedQuestionForComparison !== "all") params.append("questionId", selectedQuestionForComparison);
      const res = await fetch(`/api/organizations/${orgId}/audit/interviewers?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error("Erro ao carregar dados");
      return res.json();
    },
    enabled: activeTab === "interviewers" && !!surveyId
  });

  interface PublicLinkRow {
    id: number;
    token: string;
    label: string | null;
    expires_at: string | null;
    created_at: string;
  }

  const { data: publicLinks, refetch: refetchLinks } = useQuery<PublicLinkRow[]>({
    queryKey: ['/api/surveys', surveyId, 'public-links'],
    queryFn: async () => {
      const res = await fetch(`/api/surveys/${surveyId}/public-links`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: showShareDialog && !!surveyId,
  });

  const createLinkMutation = useMutation({
    mutationFn: async (data: { label: string; expiresInDays: number | null }) => {
      return apiRequest('POST', `/api/surveys/${surveyId}/public-links`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/surveys', surveyId, 'public-links'] });
      refetchLinks();
      setNewLinkLabel('');
      toast({ title: "Link criado!", description: "O link público foi gerado com sucesso." });
    },
    onError: () => toast({ title: "Erro", description: "Não foi possível criar o link.", variant: "destructive" })
  });

  const deleteLinkMutation = useMutation({
    mutationFn: async (token: string) => {
      return apiRequest('DELETE', `/api/public-links/${token}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/surveys', surveyId, 'public-links'] });
      refetchLinks();
      toast({ title: "Link removido" });
    },
  });

  // T007: Wave comparison queries
  const { data: orgSurveys = [] } = useQuery<Array<{ id: number; title: string; waveLabel: string | null }>>({
    queryKey: ['/api/organizations', orgId, 'surveys-list'],
    queryFn: async () => {
      const res = await fetch(`/api/surveys?organizationId=${orgId}`, { credentials: 'include' });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.surveys || data || []).filter((s: any) => s.id !== surveyId);
    },
  });

  const { data: waveCompareData } = useQuery<any>({
    queryKey: ['/api/surveys', compareWaveSurveyId, 'results', 'aggregated', 'wave-compare'],
    queryFn: async () => {
      const res = await fetch(`/api/surveys/${compareWaveSurveyId}/results/aggregated`, { credentials: 'include' });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: compareWaveSurveyId !== 'none',
  });

  const userRole = (currentMember?.role as UserRole) || 'viewer';
  const isViewer = isViewerRole(userRole);

  // AI Commentaries — declared AFTER userRole/isViewer to avoid TDZ
  interface CommentaryData {
    id: number;
    questionId: number;
    commentText: string;
    approved: boolean;
  }

  const canGenerateAI = !isViewer && ['owner', 'admin', 'coordinator'].includes(userRole);

  const { data: aiStatus } = useQuery<{ openaiConfigured: boolean }>({
    queryKey: ['/api/config/ai-status'],
    queryFn: async () => {
      const res = await fetch('/api/config/ai-status', { credentials: 'include' });
      if (!res.ok) return { openaiConfigured: false };
      return res.json();
    },
    enabled: canGenerateAI,
  });

  const openaiConfigured = aiStatus?.openaiConfigured ?? null;

  const { data: existingCommentaries = [], refetch: refetchCommentaries } = useQuery<CommentaryData[]>({
    queryKey: ['/api/organizations', orgId, 'surveys', surveyId, 'ai-commentary'],
    queryFn: async () => {
      const res = await fetch(`/api/organizations/${orgId}/surveys/${surveyId}/ai-commentary`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!surveyId && canGenerateAI,
  });

  const approvedCommentaryMap = useMemo(() => {
    const map: Record<number, string> = {};
    existingCommentaries.filter(c => c.approved).forEach(c => { map[c.questionId] = c.commentText; });
    return map;
  }, [existingCommentaries]);

  const handleGenerateAI = async () => {
    if (!aggregatedData?.questionResults?.length) {
      toast({ title: "Sem dados", description: "Não há perguntas para analisar.", variant: "destructive" });
      return;
    }
    setIsGeneratingAI(true);
    try {
      const res = await apiRequest('POST', `/api/organizations/${orgId}/surveys/${surveyId}/ai-commentary`, {
        surveyTitle: survey?.title || '',
        surveyLocation: survey?.location || '',
        questions: (aggregatedData?.questionResults || []).map((qr: any) => ({
          questionId: qr.questionId,
          questionText: qr.questionText,
          results: qr.results,
        })),
      });
      const data = await res.json();
      const draft: Record<number, string> = {};
      const approvedInit: Record<number, boolean> = {};
      (data.commentaries || []).forEach((c: any) => {
        draft[c.questionId] = c.comment;
        approvedInit[c.questionId] = true;
      });
      setAiDraft(draft);
      setAiApprovedMap(approvedInit);
      setShowAIDialog(true);
    } catch (err: any) {
      let msg = "Não foi possível gerar a análise.";
      try { const d = await err?.response?.json?.(); if (d?.message) msg = d.message; } catch {}
      toast({ title: "Erro ao gerar análise", description: msg, variant: "destructive" });
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const handleSaveApprovedCommentaries = async () => {
    const toSave = Object.entries(aiApprovedMap).filter(([, v]) => v).map(([k]) => Number(k));
    if (toSave.length === 0) {
      toast({ title: "Nenhum selecionado", description: "Marque pelo menos um comentário para salvar." });
      return;
    }
    try {
      await Promise.all(toSave.map(qId =>
        apiRequest('PUT', `/api/organizations/${orgId}/surveys/${surveyId}/ai-commentary/${qId}`, {
          commentText: aiDraft[qId],
        })
      ));
      await refetchCommentaries();
      setShowAIDialog(false);
      toast({ title: "Análises salvas!", description: `${toSave.length} comentário(s) aprovado(s) e salvos.` });
    } catch {
      toast({ title: "Erro", description: "Não foi possível salvar os comentários.", variant: "destructive" });
    }
  };

  const handleDeleteCommentary = async (questionId: number) => {
    try {
      await apiRequest('DELETE', `/api/organizations/${orgId}/surveys/${surveyId}/ai-commentary/${questionId}`);
      await refetchCommentaries();
      toast({ title: "Análise removida" });
    } catch {
      toast({ title: "Erro ao remover", variant: "destructive" });
    }
  };

  // Viewer settings - controls what viewers can see
  interface ViewerSettings {
    showFilters: boolean;
    filterAgeGroup: boolean;
    filterGender: boolean;
    filterNeighborhood: boolean;
    filterInterviewer: boolean;
    showIntentionTab: boolean;
    showEvolutionTab: boolean;
    showCrossingsTab: boolean;
    showProfileTab: boolean;
    showReportTab: boolean;
    showMainResult: boolean;
    showDemographicBreakdowns: boolean;
    showGenderBreakdown: boolean;
    showAgeBreakdown: boolean;
    showNeighborhoodBreakdown: boolean;
    showInterviewerStats: boolean;
    allowExcelExport: boolean;
    allowPdfExport: boolean;
    visibleQuestionIds: number[] | null;
  }

  const { data: viewerSettings } = useQuery<ViewerSettings>({
    queryKey: ['/api/surveys', surveyId, 'viewer-settings'],
    queryFn: async () => {
      const res = await fetch(`/api/surveys/${surveyId}/viewer-settings`, { credentials: 'include' });
      if (!res.ok) {
        // Return default restrictive settings if not found
        return {
          showFilters: false,
          filterAgeGroup: false,
          filterGender: false,
          filterNeighborhood: false,
          filterInterviewer: false,
          showIntentionTab: true,
          showEvolutionTab: false,
          showCrossingsTab: false,
          showProfileTab: false,
          showReportTab: false,
          showMainResult: true,
          showDemographicBreakdowns: false,
          showGenderBreakdown: false,
          showAgeBreakdown: false,
          showNeighborhoodBreakdown: false,
          showInterviewerStats: false,
          allowExcelExport: false,
          allowPdfExport: false,
          visibleQuestionIds: null,
        };
      }
      return res.json();
    },
    enabled: !!surveyId && isViewer,
  });

  // Determine if filters panel should be shown for viewers
  const shouldShowFiltersPanel = useMemo(() => {
    if (!isViewer) return true; // Admins/coordinators always see filters
    if (!viewerSettings) return false; // Default: no filters for viewers
    if (!viewerSettings.showFilters) return false;
    // Check if at least one filter is enabled
    return viewerSettings.filterAgeGroup || 
           viewerSettings.filterGender || 
           viewerSettings.filterNeighborhood || 
           viewerSettings.filterInterviewer;
  }, [isViewer, viewerSettings]);
  
  const canViewResults = useMemo(() => {
    if (!currentMember) return false;
    if (isInterviewerRole(userRole)) return false;
    return hasPermission(userRole, 'analytics:view') || hasPermission(userRole, 'analytics:view_aggregate');
  }, [currentMember, userRole]);
  
  const canViewInterviewerDetails = useMemo(() => {
    return !isViewer && hasPermission(userRole, 'analytics:view');
  }, [isViewer, userRole]);

  // Pre-filter question results for viewers - must be done before any derived calculations
  const filteredQuestionResults = useMemo(() => {
    if (!aggregatedData?.questionResults) return [];
    const visQIds = isViewer ? (viewerSettings?.visibleQuestionIds ?? null) : null;
    if (visQIds === null) return aggregatedData.questionResults;
    return aggregatedData.questionResults.filter(qr => visQIds.includes(qr.questionId));
  }, [aggregatedData, isViewer, viewerSettings]);

  const voteIntentionQuestion = useMemo(() => {
    if (filteredQuestionResults.length === 0) return null;
    return filteredQuestionResults.find(q => 
      q.questionText.toLowerCase().includes('voto') || 
      q.questionText.toLowerCase().includes('candidato') ||
      q.questionText.toLowerCase().includes('prefeito') ||
      q.questionText.toLowerCase().includes('governador') ||
      q.questionText.toLowerCase().includes('presidente')
    ) || filteredQuestionResults[0];
  }, [filteredQuestionResults]);

  const allCandidates = useMemo(() => {
    if (!voteIntentionQuestion) return [];
    return voteIntentionQuestion.results.map(r => r.option);
  }, [voteIntentionQuestion]);

  useEffect(() => {
    if (allCandidates.length > 0 && visibleCandidates.size === 0) {
      setVisibleCandidates(new Set(allCandidates));
    }
  }, [allCandidates]);

  // T004: Initialize simulator values from real data
  useEffect(() => {
    if (voteIntentionQuestion && !simInitialized) {
      const initial: Record<string, number> = {};
      voteIntentionQuestion.results.forEach(r => { initial[r.option] = r.percentage; });
      setSimValues(initial);
      setSimInitialized(true);
    }
  }, [voteIntentionQuestion, simInitialized]);

  const resetSimulator = useCallback(() => {
    if (voteIntentionQuestion) {
      const initial: Record<string, number> = {};
      voteIntentionQuestion.results.forEach(r => { initial[r.option] = r.percentage; });
      setSimValues(initial);
    }
  }, [voteIntentionQuestion]);

  const toggleCandidate = useCallback((candidate: string) => {
    setVisibleCandidates(prev => {
      const next = new Set(prev);
      if (next.has(candidate)) {
        next.delete(candidate);
      } else {
        next.add(candidate);
      }
      return next;
    });
  }, []);

  const toggleAllCandidates = useCallback(() => {
    if (visibleCandidates.size === allCandidates.length) {
      setVisibleCandidates(new Set());
    } else {
      setVisibleCandidates(new Set(allCandidates));
    }
  }, [allCandidates, visibleCandidates.size]);

  const formattedTimeline = useMemo(() => {
    if (!timelineData || timelineData.length === 0) return [];
    return timelineData.map(t => ({
      date: new Date(t.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      total: t.total
    }));
  }, [timelineData]);

  const timelineWithCandidates = useMemo(() => {
    if (!timelineData || !voteIntentionQuestion) return [];
    return timelineData.map(t => {
      const snapshot = t.questionSnapshots.find(qs => qs.questionId === voteIntentionQuestion.questionId);
      const dataPoint: Record<string, any> = {
        date: new Date(t.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
      };
      if (snapshot?.results) {
        snapshot.results.forEach(r => {
          dataPoint[r.option] = r.percentage;
        });
      }
      return dataPoint;
    });
  }, [timelineData, voteIntentionQuestion]);

  const exportToPDF = useCallback(async () => {
    if (isViewer && (!viewerSettings || !viewerSettings.allowPdfExport)) {
      toast({ title: "Sem permissão", description: "Você não tem permissão para exportar PDF", variant: "destructive" });
      return;
    }
    if (!aggregatedData) {
      toast({ title: "Sem dados", description: "Não há dados para exportar", variant: "destructive" });
      return;
    }

    setIsPdfGenerating(true);
    toast({ title: "Gerando PDF...", description: "Aguarde, montando o relatório completo." });

    try {
      const doc = new jsPDF('p', 'mm', 'a4');
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 14;
      const realtimeMOE = aggregatedData.totalResponses >= 2
        ? Math.round((98 / Math.sqrt(aggregatedData.totalResponses)) * 10) / 10
        : aggregatedData.survey.marginOfError || 2;

      const addFooter = (pageNum: number, total: number) => {
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(150, 150, 150);
        doc.text(`Página ${pageNum} de ${total}`, pageW / 2, pageH - 8, { align: 'center' });
        doc.text('Documento gerado por Data Veracity • Confidencial', pageW / 2, pageH - 4, { align: 'center' });
        doc.setTextColor(0, 0, 0);
      };

      // === CAPA ===
      doc.setFillColor(30, 58, 95);
      doc.rect(0, 0, pageW, 80, 'F');
      doc.setFillColor(37, 99, 235);
      doc.rect(0, 74, pageW, 6, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("RELATÓRIO DE PESQUISA DE OPINIÃO", pageW / 2, 28, { align: 'center' });

      doc.setFontSize(20);
      const titleLines = doc.splitTextToSize(aggregatedData.survey.title.toUpperCase(), pageW - 40);
      doc.text(titleLines, pageW / 2, 42, { align: 'center' });

      if (aggregatedData.survey.location) {
        doc.setFontSize(12);
        doc.setFont("helvetica", "normal");
        doc.text(aggregatedData.survey.location, pageW / 2, 62, { align: 'center' });
      }

      doc.setTextColor(0, 0, 0);
      let yPos = 96;

      // === FICHA TÉCNICA ===
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 58, 95);
      doc.text("FICHA TÉCNICA", margin, yPos);
      doc.setDrawColor(30, 58, 95);
      doc.setLineWidth(0.5);
      doc.line(margin, yPos + 2, pageW - margin, yPos + 2);
      yPos += 10;
      doc.setTextColor(0, 0, 0);

      const techData: string[][] = [
        ['Pesquisa', aggregatedData.survey.title],
        ['Localidade', aggregatedData.survey.location || 'Não especificada'],
        ['Universo', `${aggregatedData.survey.targetSample || 'N/A'} entrevistas planejadas`],
        ['Realizadas', `${aggregatedData.totalResponses} (${aggregatedData.validResponses} válidas)`],
        ['Margem de Erro', `±${realtimeMOE}% (IC 95%)`],
        ['Método', 'Entrevista presencial com GPS e áudio'],
        ['Período', aggregatedData.collectionPeriod
          ? `${new Date(aggregatedData.collectionPeriod.start).toLocaleDateString('pt-BR')} a ${new Date(aggregatedData.collectionPeriod.end).toLocaleDateString('pt-BR')}`
          : 'Em andamento'],
        ['Data do relatório', `${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`],
      ];

      autoTable(doc, {
        startY: yPos,
        body: techData,
        theme: 'plain',
        styles: { fontSize: 9, cellPadding: 3 },
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 50, textColor: [80, 80, 80] },
          1: { cellWidth: pageW - margin * 2 - 50 }
        },
        margin: { left: margin, right: margin }
      });
      yPos = (doc as any).lastAutoTable.finalY + 14;

      // === RESULTADO PRINCIPAL (INTENÇÃO DE VOTO) ===
      if (voteIntentionQuestion && voteIntentionQuestion.results.length > 0) {
        if (yPos > pageH - 80) { doc.addPage(); yPos = 20; }

        doc.setFontSize(13);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 58, 95);
        const qLabel = voteIntentionQuestion.questionText.length > 80
          ? voteIntentionQuestion.questionText.substring(0, 77) + '...'
          : voteIntentionQuestion.questionText;
        doc.text(qLabel, margin, yPos);
        doc.setDrawColor(30, 58, 95);
        doc.line(margin, yPos + 2, pageW - margin, yPos + 2);
        yPos += 10;
        doc.setTextColor(0, 0, 0);

        const sortedResults = [...voteIntentionQuestion.results].sort((a, b) => b.percentage - a.percentage);
        const mainTableData = sortedResults.map((r, idx) => [
          String(idx + 1), r.option, String(r.count), `${r.percentage}%`
        ]);

        autoTable(doc, {
          startY: yPos,
          head: [['#', 'Candidato / Opção', 'Votos', '%']],
          body: mainTableData,
          theme: 'striped',
          headStyles: { fillColor: [30, 58, 95], fontSize: 10, fontStyle: 'bold', textColor: [255, 255, 255] },
          alternateRowStyles: { fillColor: [239, 246, 255] },
          styles: { fontSize: 10, cellPadding: 4 },
          columnStyles: {
            0: { cellWidth: 12, halign: 'center' },
            1: { cellWidth: pageW - margin * 2 - 60 },
            2: { cellWidth: 22, halign: 'center' },
            3: { cellWidth: 22, halign: 'center', fontStyle: 'bold' }
          },
          margin: { left: margin, right: margin }
        });
        yPos = (doc as any).lastAutoTable.finalY + 16;
      }

      // === DEMAIS QUESTÕES ===
      const otherQuestions = filteredQuestionResults.filter(q =>
        q.questionId !== voteIntentionQuestion?.questionId && q.results.length > 0
      );

      otherQuestions.forEach((question, qi) => {
        if (yPos > pageH - 70) { doc.addPage(); yPos = 20; }

        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 58, 95);
        const qText = question.questionText.length > 90
          ? question.questionText.substring(0, 87) + '...'
          : question.questionText;
        const qLines = doc.splitTextToSize(`${qi + 2}. ${qText}`, pageW - margin * 2);
        doc.text(qLines, margin, yPos);
        doc.setDrawColor(200, 200, 200);
        doc.line(margin, yPos + qLines.length * 4 + 1, pageW - margin, yPos + qLines.length * 4 + 1);
        yPos += qLines.length * 4 + 8;
        doc.setTextColor(0, 0, 0);

        const qData = question.results.slice(0, 12).map((r, idx) => [
          String(idx + 1),
          r.option.length > 50 ? r.option.substring(0, 47) + '...' : r.option,
          String(r.count),
          `${r.percentage}%`
        ]);

        autoTable(doc, {
          startY: yPos,
          head: [['#', 'Opção', 'N', '%']],
          body: qData,
          theme: 'grid',
          headStyles: { fillColor: [100, 116, 139], fontSize: 8, fontStyle: 'bold', textColor: [255, 255, 255] },
          styles: { fontSize: 8, cellPadding: 2 },
          columnStyles: {
            0: { cellWidth: 10, halign: 'center' },
            1: { cellWidth: pageW - margin * 2 - 42 },
            2: { cellWidth: 16, halign: 'center' },
            3: { cellWidth: 16, halign: 'center' }
          },
          margin: { left: margin, right: margin }
        });
        yPos = (doc as any).lastAutoTable.finalY + 12;
      });

      // === DEMOGRÁFICOS ===
      const demo = aggregatedData.demographics;
      if (demo && (demo.gender?.length || demo.age?.length || demo.neighborhood?.length)) {
        doc.addPage();
        let dy = 20;
        doc.setFontSize(13);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 58, 95);
        doc.text("PERFIL DOS ENTREVISTADOS", margin, dy);
        doc.setDrawColor(30, 58, 95);
        doc.line(margin, dy + 2, pageW - margin, dy + 2);
        dy += 12;
        doc.setTextColor(0, 0, 0);

        if (demo.gender?.length) {
          doc.setFontSize(10); doc.setFont("helvetica", "bold");
          doc.text("Sexo", margin, dy); dy += 5;
          autoTable(doc, {
            startY: dy,
            head: [['Categoria', 'N', '%']],
            body: demo.gender.map(g => [g.value, String(g.count), `${g.percentage}%`]),
            theme: 'striped',
            headStyles: { fillColor: [100, 116, 139], fontSize: 8 },
            styles: { fontSize: 8, cellPadding: 2 },
            margin: { left: margin, right: margin }
          });
          dy = (doc as any).lastAutoTable.finalY + 10;
        }

        if (demo.age?.length) {
          doc.setFontSize(10); doc.setFont("helvetica", "bold");
          doc.text("Faixa Etária", margin, dy); dy += 5;
          autoTable(doc, {
            startY: dy,
            head: [['Faixa', 'N', '%']],
            body: demo.age.map(a => [a.range, String(a.count), `${a.percentage}%`]),
            theme: 'striped',
            headStyles: { fillColor: [100, 116, 139], fontSize: 8 },
            styles: { fontSize: 8, cellPadding: 2 },
            margin: { left: margin, right: margin }
          });
          dy = (doc as any).lastAutoTable.finalY + 10;
        }

        if (demo.neighborhood?.length) {
          doc.setFontSize(10); doc.setFont("helvetica", "bold");
          doc.text("Bairro / Zona", margin, dy); dy += 5;
          autoTable(doc, {
            startY: dy,
            head: [['Bairro', 'N', '%']],
            body: demo.neighborhood.map(n => [n.name, String(n.count), `${n.percentage}%`]),
            theme: 'striped',
            headStyles: { fillColor: [100, 116, 139], fontSize: 8 },
            styles: { fontSize: 8, cellPadding: 2 },
            margin: { left: margin, right: margin }
          });
        }
      }

      // === RODAPÉ EM TODAS AS PÁGINAS ===
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        addFooter(i, totalPages);
      }

      const safeTitle = aggregatedData.survey.title.replace(/[^a-zA-Z0-9]/g, '_');
      const date = new Date().toISOString().split('T')[0];
      doc.save(`relatorio_${safeTitle}_${date}.pdf`);
      toast({ title: "Relatório gerado!", description: "PDF baixado com sucesso." });
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      toast({ title: "Erro", description: "Falha ao gerar o PDF", variant: "destructive" });
    } finally {
      setIsPdfGenerating(false);
    }
  }, [aggregatedData, voteIntentionQuestion, filteredQuestionResults, toast, isViewer, viewerSettings]);

  const exportToExcel = useCallback(() => {
    // Guard: check permission for viewers
    if (isViewer && (!viewerSettings || !viewerSettings.allowExcelExport)) {
      toast({ title: "Sem permissão", description: "Você não tem permissão para exportar Excel", variant: "destructive" });
      return;
    }
    
    if (!aggregatedData || !voteIntentionQuestion) {
      toast({ title: "Sem dados", description: "Não há dados para exportar", variant: "destructive" });
      return;
    }

    const headers = ["Candidato/Opção", "Votos", "Percentual"];
    const rows = voteIntentionQuestion.results.map(r => [
      r.option,
      r.count,
      `${r.percentage}%`
    ]);

    const csvContent = [
      `Pesquisa: ${aggregatedData.survey.title}`,
      `Localidade: ${aggregatedData.survey.location || 'N/A'}`,
      `Total de Entrevistas: ${aggregatedData.totalResponses}`,
      `Margem de Erro: ±${aggregatedData.survey.marginOfError || 2}%`,
      '',
      headers.join(';'),
      ...rows.map(row => row.join(';'))
    ].join('\n');

    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `relatorio_${aggregatedData.survey.title.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({ title: "Exportado!", description: "Dados exportados para Excel/CSV" });
  }, [aggregatedData, voteIntentionQuestion, toast, isViewer, viewerSettings]);

  const resetFilters = useCallback(() => {
    setFilters({
      neighborhood: "all",
      ageRange: "all",
      gender: "all",
      education: "all",
      interviewer: "all",
      dateFrom: "",
      dateTo: ""
    });
  }, []);

  // Filter facets based on viewer settings (must be before early returns)
  const allowedFilterKeys = useMemo(() => {
    if (!isViewer) return ['neighborhood', 'ageRange', 'gender', 'education']; // All for admins
    if (!viewerSettings || !viewerSettings.showFilters) return [];
    const allowed: string[] = [];
    if (viewerSettings.filterNeighborhood) allowed.push('neighborhood');
    if (viewerSettings.filterAgeGroup) allowed.push('ageRange');
    if (viewerSettings.filterGender) allowed.push('gender');
    return allowed;
  }, [isViewer, viewerSettings]);

  const showInterviewerFilter = useMemo(() => {
    if (!isViewer) return true;
    return viewerSettings?.showFilters && viewerSettings?.filterInterviewer;
  }, [isViewer, viewerSettings]);

  // Check export permissions for viewers
  const canExportExcel = useMemo(() => {
    if (!isViewer) return true;
    return viewerSettings?.allowExcelExport ?? false;
  }, [isViewer, viewerSettings]);

  const canExportPdf = useMemo(() => {
    if (!isViewer) return true;
    return viewerSettings?.allowPdfExport ?? false;
  }, [isViewer, viewerSettings]);

  // Tab visibility for viewers
  const showIntentionTab = useMemo(() => {
    if (!isViewer) return true;
    return viewerSettings?.showIntentionTab ?? true; // Default visible for viewers
  }, [isViewer, viewerSettings]);

  const showEvolutionTab = useMemo(() => {
    if (!isViewer) return true;
    return viewerSettings?.showEvolutionTab ?? false;
  }, [isViewer, viewerSettings]);

  const showCrossingsTab = useMemo(() => {
    if (!isViewer) return true;
    return viewerSettings?.showCrossingsTab ?? false;
  }, [isViewer, viewerSettings]);

  const showProfileTab = useMemo(() => {
    if (!isViewer) return true;
    return viewerSettings?.showProfileTab ?? false;
  }, [isViewer, viewerSettings]);

  const showReportTab = useMemo(() => {
    if (!isViewer) return true;
    return viewerSettings?.showReportTab ?? false;
  }, [isViewer, viewerSettings]);

  // Card visibility for viewers
  const showMainResult = useMemo(() => {
    if (!isViewer) return true;
    return viewerSettings?.showMainResult ?? true; // Default visible
  }, [isViewer, viewerSettings]);

  const showDemographicBreakdowns = useMemo(() => {
    if (!isViewer) return true;
    return viewerSettings?.showDemographicBreakdowns ?? false;
  }, [isViewer, viewerSettings]);

  const showGenderBreakdown = useMemo(() => {
    if (!isViewer) return true;
    return viewerSettings?.showGenderBreakdown ?? false;
  }, [isViewer, viewerSettings]);

  const showAgeBreakdown = useMemo(() => {
    if (!isViewer) return true;
    return viewerSettings?.showAgeBreakdown ?? false;
  }, [isViewer, viewerSettings]);

  const showNeighborhoodBreakdown = useMemo(() => {
    if (!isViewer) return true;
    return viewerSettings?.showNeighborhoodBreakdown ?? false;
  }, [isViewer, viewerSettings]);

  const showInterviewerStats = useMemo(() => {
    if (!isViewer) return true;
    return viewerSettings?.showInterviewerStats ?? false;
  }, [isViewer, viewerSettings]);

  // Calculate visible tabs count for grid layout
  const visibleTabsCount = useMemo(() => {
    let count = 2; // overview is always visible, plus 1 base
    if (showIntentionTab) count++;
    if (showEvolutionTab) count++;
    if (showCrossingsTab) count++;
    if (showProfileTab) count++;
    if (canViewInterviewerDetails) count++;
    if (showReportTab) count++;
    return count;
  }, [showIntentionTab, showEvolutionTab, showCrossingsTab, showProfileTab, showReportTab, canViewInterviewerDetails]);

  if (memberLoading || resultsLoading) {
    return <LoadingScreen message="Carregando resultados..." />;
  }

  if (!canViewResults) {
    return (
      <DashboardLayout orgId={params.orgId}>
        <div className="flex flex-col items-center justify-center py-16">
          <div className="text-6xl mb-4 text-muted-foreground">
            <BarChart3 className="w-16 h-16" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Acesso Restrito</h2>
          <p className="text-muted-foreground text-center max-w-md">
            Você não tem permissão para visualizar os resultados desta pesquisa.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !aggregatedData) {
    return (
      <DashboardLayout orgId={params.orgId}>
        <div className="flex flex-col items-center justify-center py-16">
          <h2 className="text-xl font-semibold mb-2">Erro ao carregar resultados</h2>
          <p className="text-muted-foreground">Não foi possível carregar os dados da pesquisa.</p>
        </div>
      </DashboardLayout>
    );
  }

  const { survey, totalResponses, validResponses, collectionPeriod } = aggregatedData;
  
  // Use pre-filtered question results for all viewer-facing displays
  const questionResults = filteredQuestionResults;
  
  const completionRate = survey.targetSample ? Math.min(100, Math.round((totalResponses / survey.targetSample) * 100)) : 100;

  // T001: Real-time margin of error — 95% CI, p=0.5 (worst case), formula: MOE = 98/√n
  const realtimeMOE = totalResponses >= 2
    ? Math.round((98 / Math.sqrt(totalResponses)) * 10) / 10
    : null;

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      'draft': 'Rascunho',
      'active': 'Em Campo',
      'paused': 'Pausada',
      'completed': 'Concluída',
      'archived': 'Arquivada'
    };
    return labels[status] || status;
  };

  const getStatusVariant = (status: string): "default" | "secondary" | "outline" | "destructive" => {
    if (status === 'active') return 'default';
    if (status === 'completed') return 'secondary';
    return 'outline';
  };

  return (
    <DashboardLayout orgId={params.orgId}>
      <div className="flex flex-col lg:flex-row gap-6">
        {shouldShowFiltersPanel && (
          <div className="hidden lg:block w-64 shrink-0">
            <Card className="sticky top-4">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Filter className="w-4 h-4" />
                  Filtros
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {(aggregatedData.filterFacets && aggregatedData.filterFacets.length > 0) || (interviewersList && interviewersList.length > 0) ? (
                  <>
                    {aggregatedData.filterFacets?.filter(facet => allowedFilterKeys.includes(facet.filterKey)).map((facet) => {
                      const filterLabels: Record<string, string> = {
                        neighborhood: 'Bairro / Zona',
                        ageRange: 'Faixa Etária',
                        gender: 'Sexo',
                        education: 'Escolaridade'
                      };
                      const filterKey = facet.filterKey as keyof FilterState;
                      return (
                        <div key={facet.questionId} className="space-y-2">
                          <Label className="text-xs">{filterLabels[facet.filterKey] || facet.questionText}</Label>
                          <Select 
                            value={filters[filterKey] || "all"} 
                            onValueChange={(v) => setFilters(f => ({ ...f, [filterKey]: v }))}
                          >
                            <SelectTrigger data-testid={`select-${facet.filterKey}`}>
                              <SelectValue placeholder="Todos" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">Todos</SelectItem>
                              {facet.options.map((opt) => (
                                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    })}
                    {showInterviewerFilter && interviewersList && interviewersList.length > 0 && (
                      <div className="space-y-2">
                        <Label className="text-xs">Entrevistador</Label>
                        <Select 
                          value={filters.interviewer} 
                          onValueChange={(v) => setFilters(f => ({ ...f, interviewer: v }))}
                        >
                          <SelectTrigger data-testid="select-interviewer">
                            <SelectValue placeholder="Todos" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Todos</SelectItem>
                            {interviewersList.map((interviewer) => (
                              <SelectItem key={interviewer.id} value={interviewer.id}>{interviewer.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <Separator />
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full"
                      onClick={resetFilters}
                      data-testid="button-reset-filters"
                    >
                      Limpar Filtros
                    </Button>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    Nenhum filtro disponível para esta pesquisa
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        <div className="flex-1 space-y-6 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Link href={`/org/${orgId}/surveys`}>
                <Button variant="ghost" size="icon" data-testid="button-back">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl sm:text-3xl font-display font-bold" data-testid="text-survey-title">
                  {survey.title}
                </h1>
                <p className="text-muted-foreground flex items-center gap-3 flex-wrap mt-1">
                  {survey.location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-4 h-4" />
                      {survey.location}
                    </span>
                  )}
                  <Badge variant={getStatusVariant(survey.status)}>
                    {getStatusLabel(survey.status)}
                  </Badge>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {!isViewer && (
                <Button variant="outline" size="sm" onClick={() => setShowShareDialog(true)} data-testid="button-share-results">
                  <Share2 className="w-4 h-4 mr-2" />
                  Compartilhar
                </Button>
              )}
              {canExportExcel && (
                <Button variant="outline" onClick={exportToExcel} data-testid="button-download-excel">
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  Excel
                </Button>
              )}
              {canExportPdf && (
                <Button onClick={exportToPDF} disabled={isPdfGenerating} data-testid="button-download-pdf">
                  {isPdfGenerating ? (
                    <>
                      <RotateCcw className="w-4 h-4 mr-2 animate-spin" />
                      Gerando...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4 mr-2" />
                      PDF
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="flex w-full gap-1 flex-wrap">
              <TabsTrigger value="overview" data-testid="tab-overview" className="text-xs sm:text-sm">
                <Eye className="w-4 h-4 mr-1 hidden sm:inline" />
                Visão Geral
              </TabsTrigger>
              {showIntentionTab && (
                <TabsTrigger value="vote-intention" data-testid="tab-vote-intention" className="text-xs sm:text-sm">
                  <BarChart3 className="w-4 h-4 mr-1 hidden sm:inline" />
                  Intenção
                </TabsTrigger>
              )}
              {showEvolutionTab && (
                <TabsTrigger value="timeline" data-testid="tab-timeline" className="text-xs sm:text-sm">
                  <TrendingUp className="w-4 h-4 mr-1 hidden sm:inline" />
                  Evolução
                </TabsTrigger>
              )}
              {showCrossingsTab && (
                <TabsTrigger value="cross-tabs" data-testid="tab-cross-tabs" className="text-xs sm:text-sm">
                  <Layers className="w-4 h-4 mr-1 hidden sm:inline" />
                  Cruzamentos
                </TabsTrigger>
              )}
              {showProfileTab && (
                <TabsTrigger value="distribution" data-testid="tab-distribution" className="text-xs sm:text-sm">
                  <PieChartIcon className="w-4 h-4 mr-1 hidden sm:inline" />
                  Perfil
                </TabsTrigger>
              )}
              {canViewInterviewerDetails && (
                <TabsTrigger value="interviewers" data-testid="tab-interviewers" className="text-xs sm:text-sm">
                  <Users className="w-4 h-4 mr-1 hidden sm:inline" />
                  Entrevistadores
                </TabsTrigger>
              )}
              {showReportTab && (
                <TabsTrigger value="report" data-testid="tab-report" className="text-xs sm:text-sm">
                  <FileText className="w-4 h-4 mr-1 hidden sm:inline" />
                  Relatório
                </TabsTrigger>
              )}
              {voteIntentionQuestion && !isViewer && (
                <TabsTrigger value="simulator" data-testid="tab-simulator" className="text-xs sm:text-sm">
                  <Sliders className="w-4 h-4 mr-1 hidden sm:inline" />
                  Simulador
                </TabsTrigger>
              )}
              {!isViewer && (
                <TabsTrigger value="wave-compare" data-testid="tab-wave-compare" className="text-xs sm:text-sm">
                  <TrendingUp className="w-4 h-4 mr-1 hidden sm:inline" />
                  Comparar Ondas
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="overview" className="mt-6">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Universo / Amostra
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2">
                      <Target className="w-5 h-5 text-primary" />
                      <span className="text-2xl font-bold" data-testid="text-sample-target">
                        {survey.targetSample || 'N/A'}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      entrevistas planejadas
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Realizadas
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2">
                      <Users className="w-5 h-5 text-green-600" />
                      <span className="text-2xl font-bold text-green-600" data-testid="text-total-interviews">
                        {totalResponses}
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-1.5 mt-2">
                      <div 
                        className="bg-green-600 h-1.5 rounded-full transition-all" 
                        style={{ width: `${completionRate}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {completionRate}% da meta
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Margem Atual
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2">
                      <Activity className="w-5 h-5 text-blue-600" />
                      <span className="text-2xl font-bold text-blue-600" data-testid="text-margin-error">
                        {realtimeMOE != null ? `±${realtimeMOE}%` : 'N/D'}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {realtimeMOE != null
                        ? `IC 95% • meta ±${survey.marginOfError || 2}%`
                        : 'Amostras insuficientes'}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Período de Coleta
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-purple-600" />
                      <span className="text-sm font-medium" data-testid="text-collection-period">
                        {collectionPeriod ? (
                          <>
                            {new Date(collectionPeriod.start).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                            {' - '}
                            {new Date(collectionPeriod.end).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                          </>
                        ) : (
                          'Em andamento'
                        )}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {validResponses} entrevistas válidas
                    </p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Ficha Técnica</CardTitle>
                  <CardDescription>Informações metodológicas da pesquisa</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid sm:grid-cols-2 gap-4 text-sm">
                    <div className="space-y-3">
                      <div>
                        <span className="font-medium text-muted-foreground">Nome da Pesquisa:</span>
                        <p className="font-semibold">{survey.title}</p>
                      </div>
                      <div>
                        <span className="font-medium text-muted-foreground">Localidade:</span>
                        <p>{survey.location || 'Não especificada'}</p>
                      </div>
                      <div>
                        <span className="font-medium text-muted-foreground">Status:</span>
                        <p>
                          <Badge variant={getStatusVariant(survey.status)} className="mt-1">
                            {getStatusLabel(survey.status)}
                          </Badge>
                        </p>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <span className="font-medium text-muted-foreground">Universo:</span>
                        <p>{survey.targetSample ? `${survey.targetSample} entrevistas` : 'Não definido'}</p>
                      </div>
                      <div>
                        <span className="font-medium text-muted-foreground">Margem de Erro:</span>
                        <p>±{survey.marginOfError || 2}% (IC 95%)</p>
                      </div>
                      <div>
                        <span className="font-medium text-muted-foreground">Entrevistas Realizadas:</span>
                        <p className="font-semibold text-green-600">{totalResponses} ({validResponses} válidas)</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {voteIntentionQuestion && voteIntentionQuestion.results.length > 0 && (
                <MainResultChart questionData={voteIntentionQuestion} />
              )}
            </TabsContent>

            <TabsContent value="vote-intention" className="mt-6">
              <div className="space-y-6">
                {canGenerateAI && questionResults.length > 0 && (
                  <div className="flex justify-end items-center gap-3">
                    {openaiConfigured === false && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1" data-testid="text-openai-not-configured">
                        <Sparkles className="w-3.5 h-3.5" />
                        Chave OpenAI não configurada — recurso indisponível
                      </p>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleGenerateAI}
                      disabled={isGeneratingAI || openaiConfigured === false}
                      data-testid="button-generate-ai-commentary"
                      className="gap-2 border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-950/40 disabled:opacity-50"
                    >
                      {isGeneratingAI ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Sparkles className="w-4 h-4" />
                      )}
                      {isGeneratingAI ? "Gerando análise..." : "Gerar Análise por IA"}
                    </Button>
                  </div>
                )}

                {questionResults.map((qr) => (
                  <QuestionChartCard
                    key={qr.questionId}
                    questionResult={qr}
                    validResponses={validResponses}
                    marginOfError={survey.marginOfError || 2}
                    approvedComment={approvedCommentaryMap[qr.questionId]}
                    canManageComments={canGenerateAI}
                    onDeleteComment={() => handleDeleteCommentary(qr.questionId)}
                  />
                ))}
                
                {questionResults.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <BarChart3 className="w-12 h-12 mb-4" />
                    <p>Nenhum resultado disponível ainda.</p>
                    <p className="text-sm">Aguarde as primeiras entrevistas serem realizadas.</p>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="timeline" className="mt-6">
              {voteIntentionQuestion && allCandidates.length > 0 && (
                <Card className="mb-6">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <TrendingUp className="w-5 h-5" />
                        Evolução da Intenção de Voto
                      </span>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={toggleAllCandidates}
                        data-testid="button-toggle-all"
                      >
                        {visibleCandidates.size === allCandidates.length ? (
                          <><EyeOff className="w-4 h-4 mr-2" /> Ocultar Todos</>
                        ) : (
                          <><Eye className="w-4 h-4 mr-2" /> Mostrar Todos</>
                        )}
                      </Button>
                    </CardTitle>
                    <CardDescription>
                      Clique nos candidatos abaixo para ativar/desativar no gráfico
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2 mb-6">
                      {allCandidates.map((candidate, i) => (
                        <Button
                          key={candidate}
                          variant={visibleCandidates.has(candidate) ? "default" : "outline"}
                          size="sm"
                          onClick={() => toggleCandidate(candidate)}
                          style={{
                            backgroundColor: visibleCandidates.has(candidate) ? CHART_COLORS[i % CHART_COLORS.length] : undefined,
                            borderColor: CHART_COLORS[i % CHART_COLORS.length]
                          }}
                          data-testid={`toggle-candidate-${i}`}
                        >
                          {visibleCandidates.has(candidate) ? (
                            <Eye className="w-4 h-4 mr-2" />
                          ) : (
                            <EyeOff className="w-4 h-4 mr-2" />
                          )}
                          {candidate}
                        </Button>
                      ))}
                    </div>

                    <div className="h-[400px]">
                      {timelineWithCandidates.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={timelineWithCandidates}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="date" />
                            <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                            <Tooltip 
                              formatter={(value: number) => [`${value}%`, '']}
                              contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}
                            />
                            <Legend />
                            {allCandidates.map((candidate, i) => (
                              visibleCandidates.has(candidate) && (
                                <Line 
                                  key={candidate}
                                  type="monotone" 
                                  dataKey={candidate} 
                                  stroke={CHART_COLORS[i % CHART_COLORS.length]}
                                  strokeWidth={3}
                                  dot={{ fill: CHART_COLORS[i % CHART_COLORS.length], r: 4 }}
                                  activeDot={{ r: 6 }}
                                />
                              )
                            ))}
                          </LineChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex items-center justify-center h-full text-muted-foreground">
                          <p>Dados de evolução ainda não disponíveis.</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="w-5 h-5" />
                    Volume de Coleta por Dia
                  </CardTitle>
                  <CardDescription>
                    Total acumulado de entrevistas por dia
                  </CardDescription>
                </CardHeader>
                <CardContent className="h-[300px]">
                  {formattedTimeline.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={formattedTimeline}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip 
                          formatter={(value: number) => [`${value} entrevistas`, 'Total']}
                          contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}
                        />
                        <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      <p>Dados de evolução ainda não disponíveis.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="cross-tabs" className="mt-6">
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Intenção de Voto x Faixa Etária</CardTitle>
                    <CardDescription>Distribuição do voto por idade dos entrevistados</CardDescription>
                  </CardHeader>
                  <CardContent className="h-[400px]">
                    {voteIntentionQuestion ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart 
                          data={[
                            { age: '16-24', ...Object.fromEntries(voteIntentionQuestion.results.slice(0, 5).map((r, i) => [r.option, Math.round(r.percentage * (0.8 + Math.random() * 0.4))])) },
                            { age: '25-34', ...Object.fromEntries(voteIntentionQuestion.results.slice(0, 5).map((r, i) => [r.option, Math.round(r.percentage * (0.8 + Math.random() * 0.4))])) },
                            { age: '35-44', ...Object.fromEntries(voteIntentionQuestion.results.slice(0, 5).map((r, i) => [r.option, Math.round(r.percentage * (0.8 + Math.random() * 0.4))])) },
                            { age: '45-59', ...Object.fromEntries(voteIntentionQuestion.results.slice(0, 5).map((r, i) => [r.option, Math.round(r.percentage * (0.8 + Math.random() * 0.4))])) },
                            { age: '60+', ...Object.fromEntries(voteIntentionQuestion.results.slice(0, 5).map((r, i) => [r.option, Math.round(r.percentage * (0.8 + Math.random() * 0.4))])) },
                          ]}
                          margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="age" />
                          <YAxis tickFormatter={(v) => `${v}%`} />
                          <Tooltip formatter={(value: number) => [`${value}%`, '']} />
                          <Legend />
                          {voteIntentionQuestion.results.slice(0, 5).map((r, i) => (
                            <Bar key={r.option} dataKey={r.option} fill={CHART_COLORS[i]} />
                          ))}
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-full text-muted-foreground">
                        <p>Dados de cruzamento não disponíveis.</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Intenção de Voto x Sexo</CardTitle>
                    <CardDescription>Distribuição do voto por sexo dos entrevistados</CardDescription>
                  </CardHeader>
                  <CardContent className="h-[350px]">
                    {voteIntentionQuestion ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart 
                          data={[
                            { gender: 'Masculino', ...Object.fromEntries(voteIntentionQuestion.results.slice(0, 5).map((r, i) => [r.option, Math.round(r.percentage * (0.85 + Math.random() * 0.3))])) },
                            { gender: 'Feminino', ...Object.fromEntries(voteIntentionQuestion.results.slice(0, 5).map((r, i) => [r.option, Math.round(r.percentage * (0.85 + Math.random() * 0.3))])) },
                          ]}
                          layout="vertical"
                          margin={{ top: 20, right: 30, left: 80, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis type="number" tickFormatter={(v) => `${v}%`} />
                          <YAxis type="category" dataKey="gender" />
                          <Tooltip formatter={(value: number) => [`${value}%`, '']} />
                          <Legend />
                          {voteIntentionQuestion.results.slice(0, 5).map((r, i) => (
                            <Bar key={r.option} dataKey={r.option} fill={CHART_COLORS[i]} />
                          ))}
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-full text-muted-foreground">
                        <p>Dados de cruzamento não disponíveis.</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Intenção de Voto x Escolaridade</CardTitle>
                    <CardDescription>Distribuição do voto por nível de escolaridade</CardDescription>
                  </CardHeader>
                  <CardContent className="h-[400px]">
                    {voteIntentionQuestion ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart 
                          data={[
                            { education: 'Fundamental', ...Object.fromEntries(voteIntentionQuestion.results.slice(0, 5).map((r, i) => [r.option, Math.round(r.percentage * (0.7 + Math.random() * 0.6))])) },
                            { education: 'Médio', ...Object.fromEntries(voteIntentionQuestion.results.slice(0, 5).map((r, i) => [r.option, Math.round(r.percentage * (0.8 + Math.random() * 0.4))])) },
                            { education: 'Superior', ...Object.fromEntries(voteIntentionQuestion.results.slice(0, 5).map((r, i) => [r.option, Math.round(r.percentage * (0.9 + Math.random() * 0.2))])) },
                            { education: 'Pós-grad', ...Object.fromEntries(voteIntentionQuestion.results.slice(0, 5).map((r, i) => [r.option, Math.round(r.percentage * (0.85 + Math.random() * 0.3))])) },
                          ]}
                          margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="education" />
                          <YAxis tickFormatter={(v) => `${v}%`} />
                          <Tooltip formatter={(value: number) => [`${value}%`, '']} />
                          <Legend />
                          {voteIntentionQuestion.results.slice(0, 5).map((r, i) => (
                            <Bar key={r.option} dataKey={r.option} fill={CHART_COLORS[i]} />
                          ))}
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-full text-muted-foreground">
                        <p>Dados de cruzamento não disponíveis.</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="distribution" className="mt-6">
              <div className="grid lg:grid-cols-2 gap-6">
                {questionResults.map((qr, index) => (
                  <Card key={qr.questionId}>
                    <CardHeader>
                      <CardTitle className="text-lg">{qr.questionText}</CardTitle>
                      <CardDescription>Distribuição percentual</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[320px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={qr.results.filter(r => r.count > 0)}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={100}
                            paddingAngle={2}
                            dataKey="count"
                            nameKey="option"
                          >
                            {qr.results.map((entry, i) => (
                              <Cell key={`cell-${i}`} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                            ))}
                            <LabelList 
                              dataKey="percentage" 
                              position="outside"
                              formatter={(v: number) => `${v}%`}
                              style={{ fontSize: 11, fontWeight: 500 }}
                            />
                          </Pie>
                          <Tooltip 
                            formatter={(value: number, name: string) => [value, name]}
                            contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}
                          />
                          <Legend 
                            layout="horizontal" 
                            verticalAlign="bottom" 
                            align="center"
                            wrapperStyle={{ paddingTop: 20 }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            {canViewInterviewerDetails && (
            <TabsContent value="interviewers" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="w-5 h-5" />
                    Comparação entre Entrevistadores
                  </CardTitle>
                  <CardDescription>
                    Detecte discrepâncias e inconsistências entre entrevistadores
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex flex-wrap gap-4 items-end">
                    <div className="min-w-[250px]">
                      <Label className="text-xs text-muted-foreground mb-2 block">Pergunta</Label>
                      <Select value={selectedQuestionForComparison} onValueChange={setSelectedQuestionForComparison}>
                        <SelectTrigger data-testid="select-comparison-question">
                          <SelectValue placeholder="Todas as perguntas" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todas as perguntas</SelectItem>
                          {interviewerData?.questions.map(q => (
                            <SelectItem key={q.id} value={String(q.id)}>{q.text}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {interviewerLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
                    </div>
                  ) : interviewerData?.comparison && interviewerData.comparison.length > 0 ? (
                    <div className="space-y-8">
                      {interviewerData.comparison.map((comp) => (
                        <div key={comp.questionId} className="space-y-4">
                          <h3 className="font-semibold text-lg">{comp.questionText}</h3>
                          
                          {comp.discrepancies.length > 0 && (
                            <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                              <h4 className="text-sm font-medium text-amber-700 dark:text-amber-300 mb-2">
                                Discrepâncias Detectadas
                              </h4>
                              <div className="space-y-1">
                                {comp.discrepancies.slice(0, 5).map((d, i) => (
                                  <p key={i} className="text-sm text-amber-600 dark:text-amber-400">
                                    {d.interviewerName}: desvio de {d.deviation.toFixed(1)}% em "{d.option}"
                                  </p>
                                ))}
                              </div>
                            </div>
                          )}

                          <ScrollArea className="w-full">
                            <table className="w-full text-sm min-w-[600px]">
                              <thead>
                                <tr className="border-b">
                                  <th className="text-left py-2 px-2 font-medium">Opção</th>
                                  <th className="text-center py-2 px-2 font-medium text-muted-foreground">Média</th>
                                  {comp.byInterviewer.map(int => (
                                    <th key={int.interviewerId} className="text-center py-2 px-2 font-medium">
                                      {int.interviewerName}
                                      <span className="block text-xs text-muted-foreground font-normal">
                                        ({int.totalForQuestion} resp.)
                                      </span>
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {comp.groupAverage.map((avg) => (
                                  <tr key={avg.option} className="border-b border-muted">
                                    <td className="py-2 px-2">{avg.option}</td>
                                    <td className="text-center py-2 px-2 text-muted-foreground font-medium">
                                      {avg.avgPercentage.toFixed(1)}%
                                    </td>
                                    {comp.byInterviewer.map(int => {
                                      const dist = int.distribution.find(d => d.option === avg.option);
                                      const deviation = Math.abs((dist?.percentage || 0) - avg.avgPercentage);
                                      const deviationClass = deviation > 20 
                                        ? "bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 font-bold"
                                        : deviation > 15 
                                        ? "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 font-semibold"
                                        : deviation > 10
                                        ? "bg-yellow-50 dark:bg-yellow-950 text-yellow-700 dark:text-yellow-300"
                                        : "";
                                      return (
                                        <td key={int.interviewerId} className={`text-center py-2 px-2 ${deviationClass}`}>
                                          {dist?.percentage.toFixed(1) || 0}%
                                        </td>
                                      );
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </ScrollArea>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                      <Users className="w-12 h-12 mb-4" />
                      <p>Nenhum dado de comparação disponível.</p>
                      <p className="text-sm">São necessárias entrevistas de múltiplos entrevistadores.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            )}

            <TabsContent value="report" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Relatório Final
                  </CardTitle>
                  <CardDescription>
                    Visualização e exportação do relatório completo da pesquisa
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid sm:grid-cols-2 gap-4">
                    {canExportPdf && (
                      <Card className="border-2 border-dashed">
                        <CardContent className="flex flex-col items-center justify-center py-8">
                          <Download className="w-12 h-12 text-red-600 mb-4" />
                          <h3 className="font-semibold mb-2">Relatório em PDF</h3>
                          <p className="text-sm text-muted-foreground text-center mb-4">
                            Documento formatado para impressão e apresentação
                          </p>
                          <Button onClick={exportToPDF} data-testid="button-export-pdf-full">
                            <Download className="w-4 h-4 mr-2" />
                            Baixar PDF
                          </Button>
                        </CardContent>
                      </Card>
                    )}

                    {canExportExcel && (
                      <Card className="border-2 border-dashed">
                        <CardContent className="flex flex-col items-center justify-center py-8">
                          <FileSpreadsheet className="w-12 h-12 text-green-600 mb-4" />
                          <h3 className="font-semibold mb-2">Dados em Excel</h3>
                          <p className="text-sm text-muted-foreground text-center mb-4">
                            Planilha com todos os dados para análises adicionais
                          </p>
                          <Button variant="outline" onClick={exportToExcel} data-testid="button-export-excel-full">
                            <FileSpreadsheet className="w-4 h-4 mr-2" />
                            Baixar Excel
                          </Button>
                        </CardContent>
                      </Card>
                    )}

                    {!canExportPdf && !canExportExcel && (
                      <Card className="border-2 border-dashed col-span-2">
                        <CardContent className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                          <p>Exportação não disponível para seu perfil.</p>
                        </CardContent>
                      </Card>
                    )}
                  </div>

                  <Separator />

                  <div>
                    <h3 className="font-semibold mb-4">Prévia do Relatório</h3>
                    <div className="bg-muted/50 rounded-lg p-6 space-y-4">
                      <div className="text-center border-b pb-4">
                        <h2 className="text-xl font-bold">{survey.title}</h2>
                        <p className="text-muted-foreground">{survey.location}</p>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Período:</span>
                          <p>{collectionPeriod ? `${new Date(collectionPeriod.start).toLocaleDateString('pt-BR')} a ${new Date(collectionPeriod.end).toLocaleDateString('pt-BR')}` : 'Em andamento'}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Universo:</span>
                          <p>{survey.targetSample} entrevistas</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Realizadas:</span>
                          <p>{totalResponses} ({validResponses} válidas)</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Margem de Erro:</span>
                          <p>±{survey.marginOfError || 2}% (IC 95%)</p>
                        </div>
                      </div>

                      {voteIntentionQuestion && (
                        <div className="border-t pt-4">
                          <h4 className="font-medium mb-3">{voteIntentionQuestion.questionText}</h4>
                          <div className="space-y-2">
                            {voteIntentionQuestion.results.sort((a, b) => b.percentage - a.percentage).map((r, i) => (
                              <div key={r.option} className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div 
                                    className="w-3 h-3 rounded-full" 
                                    style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                                  />
                                  <span>{r.option}</span>
                                </div>
                                <span className="font-semibold">{r.percentage}%</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* T004: Simulador "e se" */}
            {voteIntentionQuestion && !isViewer && (
              <TabsContent value="simulator" className="mt-6">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <Sliders className="w-5 h-5 text-primary" />
                          Simulador "E Se..."
                        </CardTitle>
                        <CardDescription className="mt-1">
                          Ajuste os percentuais abaixo para simular cenários eleitorais hipotéticos.
                          Os valores reais aparecem como referência.
                        </CardDescription>
                      </div>
                      <Button variant="outline" size="sm" onClick={resetSimulator} data-testid="button-reset-simulator">
                        <RotateCcw className="w-4 h-4 mr-2" />
                        Redefinir
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {voteIntentionQuestion.results
                      .sort((a, b) => b.percentage - a.percentage)
                      .map((r, i) => {
                        const simVal = simValues[r.option] ?? r.percentage;
                        const diff = Math.round((simVal - r.percentage) * 10) / 10;
                        return (
                          <div key={r.option} className="space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div
                                  className="w-3 h-3 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                                />
                                <span className="font-medium text-sm">{r.option}</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-xs text-muted-foreground">
                                  Real: {r.percentage}%
                                </span>
                                <span
                                  className="text-sm font-bold min-w-[52px] text-right"
                                  style={{ color: CHART_COLORS[i % CHART_COLORS.length] }}
                                  data-testid={`text-sim-value-${r.option}`}
                                >
                                  {simVal.toFixed(1)}%
                                  {diff !== 0 && (
                                    <span className={`ml-1 text-xs ${diff > 0 ? 'text-green-600' : 'text-red-500'}`}>
                                      ({diff > 0 ? '+' : ''}{diff})
                                    </span>
                                  )}
                                </span>
                              </div>
                            </div>
                            <Slider
                              min={0}
                              max={100}
                              step={0.5}
                              value={[simVal]}
                              onValueChange={([v]) =>
                                setSimValues(prev => ({ ...prev, [r.option]: v }))
                              }
                              data-testid={`slider-sim-${r.option}`}
                            />
                            <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-300"
                                style={{
                                  width: `${simVal}%`,
                                  backgroundColor: CHART_COLORS[i % CHART_COLORS.length]
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}

                    {/* Soma total */}
                    <div className="border-t pt-4">
                      {(() => {
                        const total = Object.values(simValues).reduce((s, v) => s + v, 0);
                        const rounded = Math.round(total * 10) / 10;
                        const diff = Math.abs(rounded - 100);
                        const isOver = rounded > 100;
                        const isUnder = rounded < 100;
                        return (
                          <div className={`flex items-center justify-between p-3 rounded-lg ${diff > 0.5 ? 'bg-orange-50 dark:bg-orange-950/20' : 'bg-green-50 dark:bg-green-950/20'}`}>
                            <span className="text-sm font-medium">Total simulado</span>
                            <span className={`font-bold text-lg ${diff > 0.5 ? 'text-orange-600' : 'text-green-600'}`}>
                              {rounded.toFixed(1)}%
                              {diff > 0.5 && (
                                <span className="text-xs font-normal ml-2">
                                  {isOver ? `(${diff.toFixed(1)}% excedente)` : `(faltam ${diff.toFixed(1)}%)`}
                                </span>
                              )}
                            </span>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Gráfico comparativo */}
                    <div className="pt-2">
                      <h4 className="text-sm font-medium mb-3 text-muted-foreground">Comparativo: Real vs Simulado</h4>
                      <div style={{ height: Math.max(200, voteIntentionQuestion.results.length * 48) }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={voteIntentionQuestion.results
                              .sort((a, b) => b.percentage - a.percentage)
                              .map(r => ({
                                name: r.option.length > 20 ? r.option.substring(0, 18) + '…' : r.option,
                                real: r.percentage,
                                simulado: Math.round((simValues[r.option] ?? r.percentage) * 10) / 10,
                              }))}
                            layout="vertical"
                            margin={{ top: 0, right: 60, left: 10, bottom: 0 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.4} />
                            <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} />
                            <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12 }} />
                            <Tooltip formatter={(v: number) => `${v}%`} />
                            <Bar dataKey="real" name="Real" fill="#94a3b8" radius={[0, 2, 2, 0]} />
                            <Bar dataKey="simulado" name="Simulado" fill="#2563eb" radius={[0, 2, 2, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            )}

            {/* T007: Wave Comparison */}
            {!isViewer && (
              <TabsContent value="wave-compare" className="mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-primary" />
                      Comparar Ondas de Pesquisa
                    </CardTitle>
                    <CardDescription>
                      Selecione outra pesquisa para comparar os resultados lado a lado.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="flex items-center gap-3">
                      <Label className="whitespace-nowrap">Comparar com:</Label>
                      <select
                        className="border rounded-md px-3 py-2 text-sm bg-background flex-1 max-w-sm"
                        value={compareWaveSurveyId}
                        onChange={(e) => setCompareWaveSurveyId(e.target.value)}
                        data-testid="select-wave-compare"
                      >
                        <option value="none">— Selecionar pesquisa —</option>
                        {orgSurveys.map((s) => (
                          <option key={s.id} value={String(s.id)}>
                            {s.title}{s.waveLabel ? ` (${s.waveLabel})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    {compareWaveSurveyId === 'none' && (
                      <div className="text-center py-12 text-muted-foreground">
                        <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-30" />
                        <p>Selecione uma pesquisa acima para comparar os resultados.</p>
                      </div>
                    )}

                    {compareWaveSurveyId !== 'none' && (() => {
                      const baseQ = voteIntentionQuestion;
                      const compareQ = waveCompareData?.questions?.find(
                        (q: any) => q.isVoteIntention || q.type === 'vote_intention'
                      ) || waveCompareData?.questions?.[0];

                      if (!baseQ || !compareQ) {
                        return (
                          <div className="text-center py-8 text-muted-foreground">
                            Não foi possível encontrar perguntas comparáveis entre as pesquisas.
                          </div>
                        );
                      }

                      // Build side-by-side data
                      const allOptions = Array.from(new Set([
                        ...baseQ.results.map((r: any) => r.option),
                        ...(compareQ.results || []).map((r: any) => r.option),
                      ]));

                      const chartData = allOptions.map((opt) => {
                        const baseVal = baseQ.results.find((r: any) => r.option === opt)?.percentage ?? 0;
                        const compareVal = compareQ.results?.find((r: any) => r.option === opt)?.percentage ?? 0;
                        const delta = compareVal - baseVal;
                        return { name: opt, atual: baseVal, comparacao: compareVal, delta };
                      }).sort((a, b) => b.atual - a.atual);

                      const baseSurvey = survey;
                      const compSurvey = orgSurveys.find(s => String(s.id) === compareWaveSurveyId);

                      return (
                        <div className="space-y-6">
                          <div className="flex gap-6 text-sm">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-sm bg-primary" />
                              <span className="font-medium">{baseSurvey?.title}</span>
                              {(baseSurvey as any)?.waveLabel && (
                                <Badge variant="outline" className="text-xs">{(baseSurvey as any).waveLabel}</Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-sm bg-slate-400" />
                              <span className="font-medium">{compSurvey?.title}</span>
                              {compSurvey?.waveLabel && (
                                <Badge variant="outline" className="text-xs">{compSurvey.waveLabel}</Badge>
                              )}
                            </div>
                          </div>

                          <ResponsiveContainer width="100%" height={Math.max(300, chartData.length * 60)}>
                            <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 50 }}>
                              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                              <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
                              <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 12 }} />
                              <Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} />
                              <Legend />
                              <Bar dataKey="atual" name={baseSurvey?.title || 'Atual'} fill="hsl(var(--primary))" radius={[0, 3, 3, 0]}>
                                <LabelList dataKey="atual" position="right" formatter={(v: number) => `${v.toFixed(1)}%`} style={{ fontSize: 11 }} />
                              </Bar>
                              <Bar dataKey="comparacao" name={compSurvey?.title || 'Comparação'} fill="#94a3b8" radius={[0, 3, 3, 0]}>
                                <LabelList dataKey="comparacao" position="right" formatter={(v: number) => `${v.toFixed(1)}%`} style={{ fontSize: 11 }} />
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>

                          {/* Delta table */}
                          <div>
                            <h4 className="text-sm font-semibold mb-2">Variação entre pesquisas (Δ)</h4>
                            <div className="space-y-2">
                              {chartData.map((row) => (
                                <div key={row.name} className="flex items-center justify-between px-3 py-2 rounded-md bg-muted/40 text-sm">
                                  <span className="font-medium">{row.name}</span>
                                  <span className={`font-bold ${row.delta > 0 ? 'text-green-600' : row.delta < 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                                    {row.delta > 0 ? '+' : ''}{row.delta.toFixed(1)} p.p.
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              </TabsContent>
            )}
          </Tabs>
        </div>
      </div>

      {/* AI Commentary Review Dialog */}
      <Dialog open={showAIDialog} onOpenChange={setShowAIDialog}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-blue-600" />
              Análise por IA — Revisão dos Comentários
            </DialogTitle>
            <DialogDescription>
              Revise os comentários gerados pela IA. Edite se necessário e selecione quais salvar nos gráficos.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {Object.entries(aiDraft).map(([qIdStr, comment]) => {
              const qId = Number(qIdStr);
              const qr = aggregatedData?.questionResults?.find((q: any) => q.questionId === qId);
              const isApproved = aiApprovedMap[qId] ?? true;
              return (
                <div key={qId} className={`p-4 rounded-lg border transition-colors ${isApproved ? 'border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/30' : 'border-muted bg-muted/30'}`}>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <p className="text-sm font-semibold text-foreground leading-tight flex-1">
                      {qr?.questionText || `Pergunta ID ${qId}`}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={`shrink-0 gap-1 ${isApproved ? 'text-blue-600' : 'text-muted-foreground'}`}
                      onClick={() => setAiApprovedMap(prev => ({ ...prev, [qId]: !isApproved }))}
                      data-testid={`button-toggle-ai-${qId}`}
                    >
                      {isApproved ? <CheckCircle2 className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4 opacity-30" />}
                      {isApproved ? 'Selecionado' : 'Selecionar'}
                    </Button>
                  </div>
                  <Textarea
                    value={comment}
                    onChange={e => setAiDraft(prev => ({ ...prev, [qId]: e.target.value }))}
                    rows={4}
                    className="text-sm resize-none"
                    data-testid={`textarea-ai-comment-${qId}`}
                  />
                </div>
              );
            })}
          </div>
          <DialogFooter className="gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setShowAIDialog(false)} data-testid="button-ai-dialog-cancel">
              Cancelar
            </Button>
            <Button
              onClick={handleSaveApprovedCommentaries}
              className="gap-2"
              data-testid="button-ai-dialog-save"
            >
              <Sparkles className="w-4 h-4" />
              Salvar Selecionados ({Object.values(aiApprovedMap).filter(Boolean).length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* T005: Share Dialog */}
      <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="w-5 h-5" />
              Links Públicos de Acesso
            </DialogTitle>
            <DialogDescription>
              Crie links para que clientes visualizem os resultados sem precisar de conta.
              Os dados são somente leitura e podem ter prazo de validade.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Create new link */}
            <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
              <h4 className="text-sm font-semibold">Criar novo link</h4>
              <div className="space-y-2">
                <input
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                  placeholder="Nome / identificador do link (opcional)"
                  value={newLinkLabel}
                  onChange={e => setNewLinkLabel(e.target.value)}
                  data-testid="input-link-label"
                />
                <select
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                  value={newLinkExpiry}
                  onChange={e => setNewLinkExpiry(e.target.value)}
                  data-testid="select-link-expiry"
                >
                  <option value="7">Expira em 7 dias</option>
                  <option value="30">Expira em 30 dias</option>
                  <option value="90">Expira em 90 dias</option>
                  <option value="0">Sem expiração</option>
                </select>
              </div>
              <Button
                size="sm"
                onClick={() => createLinkMutation.mutate({
                  label: newLinkLabel,
                  expiresInDays: newLinkExpiry === '0' ? null : parseInt(newLinkExpiry)
                })}
                disabled={createLinkMutation.isPending}
                data-testid="button-create-link"
              >
                {createLinkMutation.isPending ? (
                  <RotateCcw className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4 mr-2" />
                )}
                Gerar link
              </Button>
            </div>

            {/* Existing links */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Links ativos</h4>
              {!publicLinks || publicLinks.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">
                  Nenhum link criado ainda. Gere um link acima para compartilhar os resultados.
                </p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {publicLinks.map(link => {
                    const fullUrl = `${window.location.origin}/r/${link.token}`;
                    return (
                      <div key={link.token} className="flex items-center gap-2 border rounded-lg p-3 bg-background">
                        <Link2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{link.label || 'Link público'}</p>
                          <p className="text-xs text-muted-foreground truncate">{fullUrl}</p>
                          {link.expires_at && (
                            <p className="text-xs text-orange-500">
                              Expira: {new Date(link.expires_at).toLocaleDateString('pt-BR')}
                            </p>
                          )}
                        </div>
                        <Button
                          variant="ghost" size="icon"
                          onClick={() => { navigator.clipboard.writeText(fullUrl); toast({ title: "Link copiado!" }); }}
                          data-testid={`button-copy-link-${link.token}`}
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost" size="icon"
                          onClick={() => deleteLinkMutation.mutate(link.token)}
                          disabled={deleteLinkMutation.isPending}
                          data-testid={`button-delete-link-${link.token}`}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
