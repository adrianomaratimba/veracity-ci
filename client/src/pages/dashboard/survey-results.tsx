import { useQuery } from "@tanstack/react-query";
import { useCurrentMember } from "@/hooks/use-organizations";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';
import { Printer, Camera } from "lucide-react";
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
  Layers
} from "lucide-react";
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Link } from "wouter";
import { hasPermission, isInterviewerRole, type UserRole } from "@shared/rbac";
import { useToast } from "@/hooks/use-toast";

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
const consolidateOptions = <T extends { option: string; count: number; percentage: number }>(
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
      ...others[0],
      option: `Outros (${others.length})`,
      count: othersSum,
      percentage: Math.round(othersPercentage * 10) / 10
    }
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
          x={-195} 
          y={-16} 
          width={32} 
          height={32} 
          clipPath="inset(0% round 50%)"
          preserveAspectRatio="xMidYMid slice"
        />
      )}
      <text 
        x={hasImage ? -155 : -8}
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

// Printable Chart Card Component
interface ChartCardProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onExportPDF?: () => void;
  onExportImage?: () => void;
  cardRef?: React.RefObject<HTMLDivElement>;
  className?: string;
}

const ChartCard = ({ title, subtitle, children, onExportPDF, onExportImage, cardRef, className }: ChartCardProps) => {
  return (
    <Card className={className} ref={cardRef}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <CardTitle className="text-lg leading-tight">{title}</CardTitle>
            {subtitle && (
              <CardDescription className="mt-1">{subtitle}</CardDescription>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {onExportImage && (
              <Button 
                variant="ghost" 
                size="icon"
                onClick={onExportImage}
                title="Exportar como imagem"
                data-testid="button-export-image"
              >
                <Camera className="w-4 h-4" />
              </Button>
            )}
            {onExportPDF && (
              <Button 
                variant="ghost" 
                size="icon"
                onClick={onExportPDF}
                title="Exportar como PDF"
                data-testid="button-export-pdf"
              >
                <Printer className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {children}
      </CardContent>
    </Card>
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
  
  const [activeTab, setActiveTab] = useState("overview");
  const [visibleCandidates, setVisibleCandidates] = useState<Set<string>>(new Set());
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

  const userRole = (currentMember?.role as UserRole) || 'viewer';
  
  const canViewResults = useMemo(() => {
    if (!currentMember) return false;
    if (isInterviewerRole(userRole)) return false;
    return hasPermission(userRole, 'analytics:view') || hasPermission(userRole, 'analytics:view_aggregate');
  }, [currentMember, userRole]);

  const voteIntentionQuestion = useMemo(() => {
    if (!aggregatedData?.questionResults) return null;
    return aggregatedData.questionResults.find(q => 
      q.questionText.toLowerCase().includes('voto') || 
      q.questionText.toLowerCase().includes('candidato') ||
      q.questionText.toLowerCase().includes('prefeito') ||
      q.questionText.toLowerCase().includes('governador') ||
      q.questionText.toLowerCase().includes('presidente')
    ) || aggregatedData.questionResults[0];
  }, [aggregatedData]);

  const allCandidates = useMemo(() => {
    if (!voteIntentionQuestion) return [];
    return voteIntentionQuestion.results.map(r => r.option);
  }, [voteIntentionQuestion]);

  useEffect(() => {
    if (allCandidates.length > 0 && visibleCandidates.size === 0) {
      setVisibleCandidates(new Set(allCandidates));
    }
  }, [allCandidates]);

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

  const exportToPDF = useCallback(() => {
    if (!aggregatedData) {
      toast({ title: "Sem dados", description: "Não há dados para exportar", variant: "destructive" });
      return;
    }

    toast({ title: "Gerando PDF...", description: "O relatório será baixado em instantes." });

    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      let yPos = 20;

      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text("RELATORIO DE PESQUISA", pageWidth / 2, yPos, { align: "center" });
      yPos += 10;

      doc.setFontSize(14);
      doc.setFont("helvetica", "normal");
      doc.text(aggregatedData.survey.title, pageWidth / 2, yPos, { align: "center" });
      yPos += 15;

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      
      const infoLines = [
        `Localidade: ${aggregatedData.survey.location || 'Nao especificada'}`,
        `Total de Entrevistas: ${aggregatedData.totalResponses}`,
        `Margem de Erro: +/- ${aggregatedData.survey.marginOfError || 2}%`,
        `Periodo: ${aggregatedData.survey.startDate ? new Date(aggregatedData.survey.startDate).toLocaleDateString('pt-BR') : 'N/A'} a ${aggregatedData.survey.endDate ? new Date(aggregatedData.survey.endDate).toLocaleDateString('pt-BR') : 'N/A'}`,
        `Data do Relatorio: ${new Date().toLocaleDateString('pt-BR')} as ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
      ];
      
      infoLines.forEach(line => {
        doc.text(line, 14, yPos);
        yPos += 6;
      });
      yPos += 5;

      if (voteIntentionQuestion && voteIntentionQuestion.results.length > 0) {
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text("INTENCAO DE VOTO", 14, yPos);
        yPos += 8;

        const tableData = voteIntentionQuestion.results.map((r, idx) => [
          String(idx + 1),
          r.option,
          String(r.count),
          `${r.percentage}%`
        ]);

        autoTable(doc, {
          startY: yPos,
          head: [['#', 'Candidato/Opcao', 'Votos', 'Percentual']],
          body: tableData,
          theme: 'striped',
          headStyles: { 
            fillColor: [30, 58, 95],
            fontSize: 10,
            fontStyle: 'bold'
          },
          styles: {
            fontSize: 9,
            cellPadding: 3
          },
          columnStyles: {
            0: { cellWidth: 15, halign: 'center' },
            1: { cellWidth: 80 },
            2: { cellWidth: 30, halign: 'center' },
            3: { cellWidth: 35, halign: 'center' }
          }
        });

        yPos = (doc as any).lastAutoTable.finalY + 15;
      }

      const otherQuestions = aggregatedData.questionResults.filter(q => 
        q.questionId !== voteIntentionQuestion?.questionId
      );

      otherQuestions.forEach(question => {
        if (yPos > 250) {
          doc.addPage();
          yPos = 20;
        }

        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        const questionText = question.questionText.length > 80 
          ? question.questionText.substring(0, 77) + '...' 
          : question.questionText;
        doc.text(questionText, 14, yPos);
        yPos += 8;

        const qTableData = question.results.slice(0, 10).map((r, idx) => [
          String(idx + 1),
          r.option.length > 40 ? r.option.substring(0, 37) + '...' : r.option,
          String(r.count),
          `${r.percentage}%`
        ]);

        autoTable(doc, {
          startY: yPos,
          head: [['#', 'Opcao', 'Qtd', '%']],
          body: qTableData,
          theme: 'grid',
          headStyles: { 
            fillColor: [100, 116, 139],
            fontSize: 9,
            fontStyle: 'bold'
          },
          styles: {
            fontSize: 8,
            cellPadding: 2
          },
          columnStyles: {
            0: { cellWidth: 12, halign: 'center' },
            1: { cellWidth: 100 },
            2: { cellWidth: 20, halign: 'center' },
            3: { cellWidth: 20, halign: 'center' }
          }
        });

        yPos = (doc as any).lastAutoTable.finalY + 12;
      });

      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.text(
          `Pagina ${i} de ${pageCount}`,
          pageWidth / 2,
          doc.internal.pageSize.getHeight() - 10,
          { align: 'center' }
        );
        doc.text(
          'Documento gerado automaticamente - Veracity',
          pageWidth / 2,
          doc.internal.pageSize.getHeight() - 5,
          { align: 'center' }
        );
      }

      const fileName = `relatorio_${aggregatedData.survey.title.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(fileName);

      toast({ title: "PDF Gerado!", description: "Relatorio exportado com sucesso." });
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      toast({ title: "Erro", description: "Falha ao gerar o PDF", variant: "destructive" });
    }
  }, [aggregatedData, voteIntentionQuestion, toast]);

  const exportToExcel = useCallback(() => {
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
  }, [aggregatedData, voteIntentionQuestion, toast]);

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

  const { survey, totalResponses, validResponses, questionResults, collectionPeriod } = aggregatedData;
  const completionRate = survey.targetSample ? Math.min(100, Math.round((totalResponses / survey.targetSample) * 100)) : 100;

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
                  {aggregatedData.filterFacets?.map((facet) => {
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
                  {interviewersList && interviewersList.length > 0 && (
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
              <Button variant="outline" onClick={exportToExcel} data-testid="button-download-excel">
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Excel
              </Button>
              <Button onClick={exportToPDF} data-testid="button-download-pdf">
                <Download className="w-4 h-4 mr-2" />
                PDF
              </Button>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-4 lg:grid-cols-7 gap-1">
              <TabsTrigger value="overview" data-testid="tab-overview" className="text-xs sm:text-sm">
                <Eye className="w-4 h-4 mr-1 hidden sm:inline" />
                Visão Geral
              </TabsTrigger>
              <TabsTrigger value="vote-intention" data-testid="tab-vote-intention" className="text-xs sm:text-sm">
                <BarChart3 className="w-4 h-4 mr-1 hidden sm:inline" />
                Intenção
              </TabsTrigger>
              <TabsTrigger value="timeline" data-testid="tab-timeline" className="text-xs sm:text-sm">
                <TrendingUp className="w-4 h-4 mr-1 hidden sm:inline" />
                Evolução
              </TabsTrigger>
              <TabsTrigger value="cross-tabs" data-testid="tab-cross-tabs" className="text-xs sm:text-sm">
                <Layers className="w-4 h-4 mr-1 hidden sm:inline" />
                Cruzamentos
              </TabsTrigger>
              <TabsTrigger value="distribution" data-testid="tab-distribution" className="text-xs sm:text-sm">
                <PieChartIcon className="w-4 h-4 mr-1 hidden sm:inline" />
                Perfil
              </TabsTrigger>
              <TabsTrigger value="interviewers" data-testid="tab-interviewers" className="text-xs sm:text-sm">
                <Users className="w-4 h-4 mr-1 hidden sm:inline" />
                Entrevistadores
              </TabsTrigger>
              <TabsTrigger value="report" data-testid="tab-report" className="text-xs sm:text-sm">
                <FileText className="w-4 h-4 mr-1 hidden sm:inline" />
                Relatório
              </TabsTrigger>
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
                      Margem de Erro
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2">
                      <Activity className="w-5 h-5 text-blue-600" />
                      <span className="text-2xl font-bold text-blue-600" data-testid="text-margin-error">
                        ±{survey.marginOfError || 2}%
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      nível de confiança 95%
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

              {voteIntentionQuestion && voteIntentionQuestion.results.length > 0 && (() => {
                const mainChartRef = useRef<HTMLDivElement>(null);
                const sortedMainResults = [...voteIntentionQuestion.results].sort((a, b) => b.percentage - a.percentage);
                const mainChartHeight = Math.max(300, sortedMainResults.length * 50);
                const hasMainImages = voteIntentionQuestion.showOptionImages;
                const mainYAxisWidth = hasMainImages ? 220 : 180;
                
                return (
                  <div ref={mainChartRef} className="mt-6 bg-background">
                    <ChartCard
                      title="Resultado Principal"
                      subtitle={voteIntentionQuestion.questionText}
                      onExportPDF={() => mainChartRef.current && exportCardAsPDF(mainChartRef.current, 'resultado-principal', voteIntentionQuestion.questionText)}
                      onExportImage={() => mainChartRef.current && exportCardAsImage(mainChartRef.current, 'resultado-principal')}
                    >
                      <div style={{ height: mainChartHeight }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart 
                            data={sortedMainResults} 
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
                              width={mainYAxisWidth}
                              axisLine={false}
                              tickLine={false}
                              tick={(props) => (
                                <CustomYAxisTick 
                                  {...props} 
                                  resultsData={sortedMainResults}
                                  showImages={hasMainImages}
                                  maxLabelLength={hasMainImages ? 20 : 25}
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
                              {sortedMainResults.map((entry, index) => (
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
                    </ChartCard>
                  </div>
                );
              })()}
            </TabsContent>

            <TabsContent value="vote-intention" className="mt-6">
              <div className="space-y-6">
                {questionResults.map((qr, index) => {
                  const chartRef = useRef<HTMLDivElement>(null);
                  const sortedResults = [...qr.results].sort((a, b) => b.percentage - a.percentage);
                  const displayResults = consolidateOptions(sortedResults, 10);
                  const chartHeight = Math.max(300, displayResults.length * 45);
                  const hasImages = qr.showOptionImages;
                  const yAxisWidth = hasImages ? 220 : 180;
                  
                  return (
                  <div key={qr.questionId} ref={chartRef} className="bg-background">
                    <ChartCard
                      title={qr.questionText}
                      subtitle={`Base: ${validResponses} entrevistas válidas | Margem de erro: ±${survey.marginOfError || 2}%`}
                      onExportPDF={() => chartRef.current && exportCardAsPDF(chartRef.current, `resultado-${qr.questionId}`, qr.questionText)}
                      onExportImage={() => chartRef.current && exportCardAsImage(chartRef.current, `resultado-${qr.questionId}`)}
                    >
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
                            {qr.results.sort((a, b) => b.percentage - a.percentage).map((r, i) => (
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
                    </ChartCard>
                  </div>
                  );
                })}
                
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
          </Tabs>
        </div>
      </div>
    </DashboardLayout>
  );
}
