import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  ArrowLeft, 
  Save, 
  Eye, 
  Settings, 
  Type, 
  Palette, 
  MessageSquare, 
  HelpCircle,
  BarChart3,
  Sparkles,
  Globe,
  Code,
  Plus,
  Trash2,
  GripVertical,
  Star,
  Quote
} from "lucide-react";
import type { LandingPageConfig, LandingStat, LandingFeature, LandingTestimonial, LandingFaq } from "@shared/schema";

const defaultFeatures: LandingFeature[] = [
  { icon: "MapPin", title: "GPS Obrigatório", description: "Cada entrevista é geolocalizada automaticamente, garantindo que foi realizada no local correto." },
  { icon: "Mic", title: "Gravação de Áudio", description: "Todas as entrevistas são gravadas para auditoria posterior, aumentando a credibilidade dos dados." },
  { icon: "ShieldCheck", title: "Detecção de Fraudes", description: "Algoritmos avançados identificam padrões suspeitos em tempo real." },
  { icon: "Smartphone", title: "App Offline", description: "Funciona sem internet. Sincroniza automaticamente quando conectado." },
  { icon: "Lock", title: "LGPD Compliant", description: "Dados criptografados e políticas de privacidade em conformidade total." },
  { icon: "BarChart3", title: "Dashboards em Tempo Real", description: "Acompanhe o progresso e resultados conforme as entrevistas são realizadas." }
];

const defaultStats: LandingStat[] = [
  { value: "+500K", label: "Entrevistas Realizadas" },
  { value: "99.8%", label: "Precisão GPS" },
  { value: "24/7", label: "Monitoramento" },
  { value: "<1%", label: "Taxa de Fraude" }
];

const defaultTestimonials: LandingTestimonial[] = [
  { quote: "O Data Veracity revolucionou nossa operação de campo. A detecção de fraudes em tempo real nos dá confiança total nos dados coletados.", author: "Maria Silva", role: "Diretora de Pesquisa", company: "Instituto DataBrasil" },
  { quote: "Antes perdíamos horas verificando inconsistências. Agora o sistema faz isso automaticamente e nossos clientes confiam mais nos resultados.", author: "Carlos Santos", role: "Coordenador de Campo", company: "Pesquisas Nacionais Ltda" },
  { quote: "A interface é intuitiva e nossos entrevistadores se adaptaram rapidamente. O suporte é excelente.", author: "Ana Oliveira", role: "Gerente de Operações", company: "OpinionPoll Brasil" }
];

const defaultFaqs: LandingFaq[] = [
  { question: "Como funciona a gravação de áudio?", answer: "O aplicativo grava automaticamente o áudio de cada entrevista quando o entrevistador inicia a coleta. A gravação é obrigatória e fica vinculada à resposta, permitindo auditoria posterior." },
  { question: "O sistema funciona offline?", answer: "Sim! O aplicativo de coleta funciona mesmo sem internet. Os dados são armazenados localmente e sincronizados automaticamente quando a conexão é restabelecida." },
  { question: "Como é feita a detecção de fraudes?", answer: "Utilizamos múltiplas camadas de verificação: precisão do GPS, duração da entrevista, padrões de resposta e fingerprint do dispositivo." },
  { question: "Os dados estão em conformidade com a LGPD?", answer: "Absolutamente. Todos os dados são criptografados em trânsito e em repouso. Implementamos controles de acesso rigorosos e logs de auditoria." }
];

export default function LandingEditor() {
  const [, navigate] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [hasChanges, setHasChanges] = useState(false);
  const [activeTab, setActiveTab] = useState("seo");

  const { data: adminCheck } = useQuery<{ isAdmin: boolean }>({
    queryKey: ['/api/admin/check'],
    enabled: !!user,
  });

  const { data: config, isLoading } = useQuery<LandingPageConfig>({
    queryKey: ['/api/landing-config'],
  });

  const [formData, setFormData] = useState<Partial<LandingPageConfig>>({});

  useEffect(() => {
    if (config) {
      setFormData({
        ...config,
        stats: (config.stats as LandingStat[])?.length > 0 ? config.stats : defaultStats,
        features: (config.features as LandingFeature[])?.length > 0 ? config.features : defaultFeatures,
        testimonials: (config.testimonials as LandingTestimonial[])?.length > 0 ? config.testimonials : defaultTestimonials,
        faqs: (config.faqs as LandingFaq[])?.length > 0 ? config.faqs : defaultFaqs,
      });
    } else if (!isLoading) {
      setFormData({
        seoTitle: "Veracity - Plataforma de Pesquisas Eleitorais",
        seoDescription: "Sistema profissional para gestão de pesquisas eleitorais com GPS, gravação de áudio e detecção de fraudes em tempo real.",
        seoKeywords: "pesquisa eleitoral, coleta de dados, GPS, anti-fraude, LGPD",
        heroHeadline: "Pesquisas Eleitorais com Credibilidade Total",
        heroSubheadline: "Sistema profissional de coleta de dados com GPS, gravação de áudio e detecção de fraudes em tempo real.",
        heroCta: "Começar Agora",
        heroCtaSecondary: "Ver Demonstração",
        statsEnabled: true,
        stats: defaultStats,
        featuresTitle: "Por que escolher o Data Veracity?",
        featuresSubtitle: "Tecnologia de ponta para pesquisas confiáveis",
        features: defaultFeatures,
        testimonialsTitle: "O que nossos clientes dizem",
        testimonials: defaultTestimonials,
        testimonialsEnabled: true,
        faqTitle: "Perguntas Frequentes",
        faqs: defaultFaqs,
        faqEnabled: true,
        ctaTitle: "Pronto para revolucionar suas pesquisas?",
        ctaSubtitle: "Comece gratuitamente e descubra como o Data Veracity pode transformar sua operação de campo.",
        ctaButton: "Criar conta grátis",
        footerText: "Desenvolvido no Brasil para institutos de pesquisa exigentes.",
      });
    }
  }, [config, isLoading]);

  const saveMutation = useMutation({
    mutationFn: async (data: Partial<LandingPageConfig>) => {
      return apiRequest('PUT', '/api/landing-config', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/landing-config'] });
      setHasChanges(false);
      toast({ title: "Salvo!", description: "As alterações foram salvas com sucesso." });
    },
    onError: () => {
      toast({ title: "Erro", description: "Não foi possível salvar as alterações.", variant: "destructive" });
    }
  });

  const updateField = (field: keyof LandingPageConfig, value: unknown) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleSave = () => {
    saveMutation.mutate(formData);
  };

  if (authLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!adminCheck?.isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground">Acesso restrito a administradores da plataforma.</p>
            <Button variant="outline" className="mt-4" onClick={() => navigate("/")}>
              Voltar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const stats = (formData.stats || []) as LandingStat[];
  const features = (formData.features || []) as LandingFeature[];
  const testimonials = (formData.testimonials || []) as LandingTestimonial[];
  const faqs = (formData.faqs || []) as LandingFaq[];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background border-b">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/platform")} data-testid="button-back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-lg font-semibold">Editor da Landing Page</h1>
              <p className="text-sm text-muted-foreground">Configure SEO, textos e aparência</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasChanges && (
              <Badge variant="secondary">Alterações não salvas</Badge>
            )}
            <Button variant="outline" onClick={() => window.open("/", "_blank")} data-testid="button-preview">
              <Eye className="w-4 h-4 mr-2" />
              Visualizar
            </Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending || !hasChanges} data-testid="button-save">
              <Save className="w-4 h-4 mr-2" />
              {saveMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid grid-cols-6 w-full max-w-3xl">
            <TabsTrigger value="seo" className="gap-2">
              <Globe className="w-4 h-4" />
              <span className="hidden sm:inline">SEO</span>
            </TabsTrigger>
            <TabsTrigger value="hero" className="gap-2">
              <Sparkles className="w-4 h-4" />
              <span className="hidden sm:inline">Hero</span>
            </TabsTrigger>
            <TabsTrigger value="features" className="gap-2">
              <Star className="w-4 h-4" />
              <span className="hidden sm:inline">Features</span>
            </TabsTrigger>
            <TabsTrigger value="testimonials" className="gap-2">
              <Quote className="w-4 h-4" />
              <span className="hidden sm:inline">Depoimentos</span>
            </TabsTrigger>
            <TabsTrigger value="faq" className="gap-2">
              <HelpCircle className="w-4 h-4" />
              <span className="hidden sm:inline">FAQ</span>
            </TabsTrigger>
            <TabsTrigger value="advanced" className="gap-2">
              <Code className="w-4 h-4" />
              <span className="hidden sm:inline">Avançado</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="seo" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="w-5 h-5" />
                  Otimização para Buscadores (SEO)
                </CardTitle>
                <CardDescription>
                  Configure metadados para melhor posicionamento no Google e redes sociais
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="seoTitle">Título da Página (Title Tag)</Label>
                  <Input
                    id="seoTitle"
                    value={formData.seoTitle || ""}
                    onChange={(e) => updateField("seoTitle", e.target.value)}
                    placeholder="Veracity - Plataforma de Pesquisas Eleitorais"
                    data-testid="input-seo-title"
                  />
                  <p className="text-xs text-muted-foreground">
                    Ideal: 50-60 caracteres. Atual: {formData.seoTitle?.length || 0}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="seoDescription">Meta Description</Label>
                  <Textarea
                    id="seoDescription"
                    value={formData.seoDescription || ""}
                    onChange={(e) => updateField("seoDescription", e.target.value)}
                    placeholder="Descrição que aparece nos resultados de busca..."
                    rows={3}
                    data-testid="input-seo-description"
                  />
                  <p className="text-xs text-muted-foreground">
                    Ideal: 150-160 caracteres. Atual: {formData.seoDescription?.length || 0}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="seoKeywords">Palavras-chave (separadas por vírgula)</Label>
                  <Input
                    id="seoKeywords"
                    value={formData.seoKeywords || ""}
                    onChange={(e) => updateField("seoKeywords", e.target.value)}
                    placeholder="pesquisa eleitoral, coleta de dados, GPS..."
                    data-testid="input-seo-keywords"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ogImage">Imagem Open Graph (URL)</Label>
                  <Input
                    id="ogImage"
                    value={formData.ogImage || ""}
                    onChange={(e) => updateField("ogImage", e.target.value)}
                    placeholder="https://exemplo.com/imagem-og.jpg"
                    data-testid="input-og-image"
                  />
                  <p className="text-xs text-muted-foreground">
                    Imagem que aparece ao compartilhar no Facebook/LinkedIn. Tamanho ideal: 1200x630px
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Preview nos Buscadores</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border">
                  <div className="text-blue-600 dark:text-blue-400 text-lg hover:underline cursor-pointer truncate">
                    {formData.seoTitle || "Título da página"}
                  </div>
                  <div className="text-green-700 dark:text-green-500 text-sm">
                    veracity.app
                  </div>
                  <div className="text-sm text-muted-foreground mt-1 line-clamp-2">
                    {formData.seoDescription || "Descrição da página..."}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="hero" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5" />
                  Seção Hero
                </CardTitle>
                <CardDescription>
                  O primeiro conteúdo que os visitantes veem ao acessar a página
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="heroHeadline">Título Principal (Headline)</Label>
                  <Input
                    id="heroHeadline"
                    value={formData.heroHeadline || ""}
                    onChange={(e) => updateField("heroHeadline", e.target.value)}
                    placeholder="Pesquisas Eleitorais com Credibilidade Total"
                    data-testid="input-hero-headline"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="heroSubheadline">Subtítulo</Label>
                  <Textarea
                    id="heroSubheadline"
                    value={formData.heroSubheadline || ""}
                    onChange={(e) => updateField("heroSubheadline", e.target.value)}
                    placeholder="Descrição de apoio..."
                    rows={3}
                    data-testid="input-hero-subheadline"
                  />
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="heroCta">Botão Principal (CTA)</Label>
                    <Input
                      id="heroCta"
                      value={formData.heroCta || ""}
                      onChange={(e) => updateField("heroCta", e.target.value)}
                      placeholder="Começar Agora"
                      data-testid="input-hero-cta"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="heroCtaSecondary">Botão Secundário</Label>
                    <Input
                      id="heroCtaSecondary"
                      value={formData.heroCtaSecondary || ""}
                      onChange={(e) => updateField("heroCtaSecondary", e.target.value)}
                      placeholder="Ver Demonstração"
                      data-testid="input-hero-cta-secondary"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="w-5 h-5" />
                      Estatísticas
                    </CardTitle>
                    <CardDescription>Números de destaque exibidos na seção hero</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="statsEnabled" className="text-sm">Exibir</Label>
                    <Switch
                      id="statsEnabled"
                      checked={formData.statsEnabled !== false}
                      onCheckedChange={(v) => updateField("statsEnabled", v)}
                      data-testid="switch-stats-enabled"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {stats.map((stat, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <GripVertical className="w-4 h-4 text-muted-foreground cursor-move" />
                    <Input
                      value={stat.value}
                      onChange={(e) => {
                        const newStats = [...stats];
                        newStats[index] = { ...stat, value: e.target.value };
                        updateField("stats", newStats);
                      }}
                      placeholder="Valor"
                      className="w-32"
                      data-testid={`input-stat-value-${index}`}
                    />
                    <Input
                      value={stat.label}
                      onChange={(e) => {
                        const newStats = [...stats];
                        newStats[index] = { ...stat, label: e.target.value };
                        updateField("stats", newStats);
                      }}
                      placeholder="Label"
                      className="flex-1"
                      data-testid={`input-stat-label-${index}`}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        const newStats = stats.filter((_, i) => i !== index);
                        updateField("stats", newStats);
                      }}
                      data-testid={`button-remove-stat-${index}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  onClick={() => updateField("stats", [...stats, { value: "", label: "" }])}
                  data-testid="button-add-stat"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Adicionar Estatística
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>CTA Final</CardTitle>
                <CardDescription>Seção de chamada para ação no final da página</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="ctaTitle">Título</Label>
                  <Input
                    id="ctaTitle"
                    value={formData.ctaTitle || ""}
                    onChange={(e) => updateField("ctaTitle", e.target.value)}
                    placeholder="Pronto para revolucionar suas pesquisas?"
                    data-testid="input-cta-title"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ctaSubtitle">Subtítulo</Label>
                  <Textarea
                    id="ctaSubtitle"
                    value={formData.ctaSubtitle || ""}
                    onChange={(e) => updateField("ctaSubtitle", e.target.value)}
                    rows={2}
                    data-testid="input-cta-subtitle"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ctaButton">Texto do Botão</Label>
                  <Input
                    id="ctaButton"
                    value={formData.ctaButton || ""}
                    onChange={(e) => updateField("ctaButton", e.target.value)}
                    placeholder="Criar conta grátis"
                    data-testid="input-cta-button"
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="features" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Star className="w-5 h-5" />
                  Seção de Funcionalidades
                </CardTitle>
                <CardDescription>
                  Destaque os principais recursos da plataforma
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="featuresTitle">Título da Seção</Label>
                    <Input
                      id="featuresTitle"
                      value={formData.featuresTitle || ""}
                      onChange={(e) => updateField("featuresTitle", e.target.value)}
                      data-testid="input-features-title"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="featuresSubtitle">Subtítulo</Label>
                    <Input
                      id="featuresSubtitle"
                      value={formData.featuresSubtitle || ""}
                      onChange={(e) => updateField("featuresSubtitle", e.target.value)}
                      data-testid="input-features-subtitle"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Accordion type="multiple" className="space-y-2">
              {features.map((feature, index) => (
                <AccordionItem key={index} value={`feature-${index}`} className="border rounded-lg px-4">
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-3">
                      <GripVertical className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">{feature.title || `Feature ${index + 1}`}</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-4 pt-2">
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Ícone (Lucide)</Label>
                        <Input
                          value={feature.icon}
                          onChange={(e) => {
                            const newFeatures = [...features];
                            newFeatures[index] = { ...feature, icon: e.target.value };
                            updateField("features", newFeatures);
                          }}
                          placeholder="MapPin, Mic, ShieldCheck..."
                          data-testid={`input-feature-icon-${index}`}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Título</Label>
                        <Input
                          value={feature.title}
                          onChange={(e) => {
                            const newFeatures = [...features];
                            newFeatures[index] = { ...feature, title: e.target.value };
                            updateField("features", newFeatures);
                          }}
                          data-testid={`input-feature-title-${index}`}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Descrição</Label>
                      <Textarea
                        value={feature.description}
                        onChange={(e) => {
                          const newFeatures = [...features];
                          newFeatures[index] = { ...feature, description: e.target.value };
                          updateField("features", newFeatures);
                        }}
                        rows={2}
                        data-testid={`input-feature-description-${index}`}
                      />
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        const newFeatures = features.filter((_, i) => i !== index);
                        updateField("features", newFeatures);
                      }}
                      data-testid={`button-remove-feature-${index}`}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Remover
                    </Button>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>

            <Button
              variant="outline"
              onClick={() => updateField("features", [...features, { icon: "Star", title: "", description: "" }])}
              data-testid="button-add-feature"
            >
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Feature
            </Button>
          </TabsContent>

          <TabsContent value="testimonials" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Quote className="w-5 h-5" />
                      Depoimentos
                    </CardTitle>
                    <CardDescription>Avaliações de clientes para gerar confiança</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="testimonialsEnabled" className="text-sm">Exibir</Label>
                    <Switch
                      id="testimonialsEnabled"
                      checked={formData.testimonialsEnabled !== false}
                      onCheckedChange={(v) => updateField("testimonialsEnabled", v)}
                      data-testid="switch-testimonials-enabled"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label htmlFor="testimonialsTitle">Título da Seção</Label>
                  <Input
                    id="testimonialsTitle"
                    value={formData.testimonialsTitle || ""}
                    onChange={(e) => updateField("testimonialsTitle", e.target.value)}
                    data-testid="input-testimonials-title"
                  />
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              {testimonials.map((testimonial, index) => (
                <Card key={index}>
                  <CardContent className="pt-6 space-y-4">
                    <div className="space-y-2">
                      <Label>Depoimento</Label>
                      <Textarea
                        value={testimonial.quote}
                        onChange={(e) => {
                          const newTestimonials = [...testimonials];
                          newTestimonials[index] = { ...testimonial, quote: e.target.value };
                          updateField("testimonials", newTestimonials);
                        }}
                        rows={3}
                        data-testid={`input-testimonial-quote-${index}`}
                      />
                    </div>
                    <div className="grid sm:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>Nome</Label>
                        <Input
                          value={testimonial.author}
                          onChange={(e) => {
                            const newTestimonials = [...testimonials];
                            newTestimonials[index] = { ...testimonial, author: e.target.value };
                            updateField("testimonials", newTestimonials);
                          }}
                          data-testid={`input-testimonial-author-${index}`}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Cargo</Label>
                        <Input
                          value={testimonial.role}
                          onChange={(e) => {
                            const newTestimonials = [...testimonials];
                            newTestimonials[index] = { ...testimonial, role: e.target.value };
                            updateField("testimonials", newTestimonials);
                          }}
                          data-testid={`input-testimonial-role-${index}`}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Empresa</Label>
                        <Input
                          value={testimonial.company}
                          onChange={(e) => {
                            const newTestimonials = [...testimonials];
                            newTestimonials[index] = { ...testimonial, company: e.target.value };
                            updateField("testimonials", newTestimonials);
                          }}
                          data-testid={`input-testimonial-company-${index}`}
                        />
                      </div>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        const newTestimonials = testimonials.filter((_, i) => i !== index);
                        updateField("testimonials", newTestimonials);
                      }}
                      data-testid={`button-remove-testimonial-${index}`}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Remover
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Button
              variant="outline"
              onClick={() => updateField("testimonials", [...testimonials, { quote: "", author: "", role: "", company: "" }])}
              data-testid="button-add-testimonial"
            >
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Depoimento
            </Button>
          </TabsContent>

          <TabsContent value="faq" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <HelpCircle className="w-5 h-5" />
                      Perguntas Frequentes
                    </CardTitle>
                    <CardDescription>Tire dúvidas comuns dos visitantes</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="faqEnabled" className="text-sm">Exibir</Label>
                    <Switch
                      id="faqEnabled"
                      checked={formData.faqEnabled !== false}
                      onCheckedChange={(v) => updateField("faqEnabled", v)}
                      data-testid="switch-faq-enabled"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label htmlFor="faqTitle">Título da Seção</Label>
                  <Input
                    id="faqTitle"
                    value={formData.faqTitle || ""}
                    onChange={(e) => updateField("faqTitle", e.target.value)}
                    data-testid="input-faq-title"
                  />
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              {faqs.map((faq, index) => (
                <Card key={index}>
                  <CardContent className="pt-6 space-y-4">
                    <div className="space-y-2">
                      <Label>Pergunta</Label>
                      <Input
                        value={faq.question}
                        onChange={(e) => {
                          const newFaqs = [...faqs];
                          newFaqs[index] = { ...faq, question: e.target.value };
                          updateField("faqs", newFaqs);
                        }}
                        data-testid={`input-faq-question-${index}`}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Resposta</Label>
                      <Textarea
                        value={faq.answer}
                        onChange={(e) => {
                          const newFaqs = [...faqs];
                          newFaqs[index] = { ...faq, answer: e.target.value };
                          updateField("faqs", newFaqs);
                        }}
                        rows={3}
                        data-testid={`input-faq-answer-${index}`}
                      />
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        const newFaqs = faqs.filter((_, i) => i !== index);
                        updateField("faqs", newFaqs);
                      }}
                      data-testid={`button-remove-faq-${index}`}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Remover
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Button
              variant="outline"
              onClick={() => updateField("faqs", [...faqs, { question: "", answer: "" }])}
              data-testid="button-add-faq"
            >
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Pergunta
            </Button>
          </TabsContent>

          <TabsContent value="advanced" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="w-5 h-5" />
                  Cores do Tema
                </CardTitle>
                <CardDescription>
                  Personalize as cores principais da landing page (deixe vazio para usar padrão)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="primaryColor">Cor Primária</Label>
                    <div className="flex gap-2">
                      <Input
                        id="primaryColor"
                        value={formData.primaryColor || ""}
                        onChange={(e) => updateField("primaryColor", e.target.value)}
                        placeholder="#1e3a5f"
                        data-testid="input-primary-color"
                      />
                      <input
                        type="color"
                        value={formData.primaryColor || "#1e3a5f"}
                        onChange={(e) => updateField("primaryColor", e.target.value)}
                        className="w-10 h-10 rounded cursor-pointer border"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="secondaryColor">Cor Secundária</Label>
                    <div className="flex gap-2">
                      <Input
                        id="secondaryColor"
                        value={formData.secondaryColor || ""}
                        onChange={(e) => updateField("secondaryColor", e.target.value)}
                        placeholder="#2563eb"
                        data-testid="input-secondary-color"
                      />
                      <input
                        type="color"
                        value={formData.secondaryColor || "#2563eb"}
                        onChange={(e) => updateField("secondaryColor", e.target.value)}
                        className="w-10 h-10 rounded cursor-pointer border"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="accentColor">Cor de Destaque</Label>
                    <div className="flex gap-2">
                      <Input
                        id="accentColor"
                        value={formData.accentColor || ""}
                        onChange={(e) => updateField("accentColor", e.target.value)}
                        placeholder="#f59e0b"
                        data-testid="input-accent-color"
                      />
                      <input
                        type="color"
                        value={formData.accentColor || "#f59e0b"}
                        onChange={(e) => updateField("accentColor", e.target.value)}
                        className="w-10 h-10 rounded cursor-pointer border"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Code className="w-5 h-5" />
                  Scripts e Analytics
                </CardTitle>
                <CardDescription>
                  Adicione código personalizado e rastreamento
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="googleAnalyticsId">Google Analytics ID</Label>
                  <Input
                    id="googleAnalyticsId"
                    value={formData.googleAnalyticsId || ""}
                    onChange={(e) => updateField("googleAnalyticsId", e.target.value)}
                    placeholder="G-XXXXXXXXXX"
                    data-testid="input-ga-id"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="customHeadScripts">Scripts no Head</Label>
                  <Textarea
                    id="customHeadScripts"
                    value={formData.customHeadScripts || ""}
                    onChange={(e) => updateField("customHeadScripts", e.target.value)}
                    placeholder="<!-- Insira scripts que devem ser carregados no <head> -->"
                    rows={4}
                    className="font-mono text-sm"
                    data-testid="input-head-scripts"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="customBodyScripts">Scripts no Body (final)</Label>
                  <Textarea
                    id="customBodyScripts"
                    value={formData.customBodyScripts || ""}
                    onChange={(e) => updateField("customBodyScripts", e.target.value)}
                    placeholder="<!-- Insira scripts que devem ser carregados no final do <body> -->"
                    rows={4}
                    className="font-mono text-sm"
                    data-testid="input-body-scripts"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Rodapé</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="footerText">Texto do Rodapé</Label>
                  <Input
                    id="footerText"
                    value={formData.footerText || ""}
                    onChange={(e) => updateField("footerText", e.target.value)}
                    data-testid="input-footer-text"
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
