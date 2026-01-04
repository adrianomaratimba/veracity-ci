import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { 
  CheckCircle2, 
  ShieldCheck, 
  BarChart3, 
  Radio, 
  Users, 
  Lock, 
  Smartphone, 
  Globe, 
  ArrowRight,
  MapPin,
  Mic,
  Clock,
  FileCheck,
  Award,
  TrendingUp,
  Star,
  Check,
  Zap
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export default function Landing() {
  const { user } = useAuth();

  const plans = [
    {
      name: "Básico",
      price: "Grátis",
      period: "",
      description: "Ideal para pequenas pesquisas e testes",
      features: [
        "Até 100 entrevistas/mês",
        "1 pesquisa ativa",
        "3 usuários",
        "GPS obrigatório",
        "Áudio obrigatório",
        "Relatórios básicos"
      ],
      cta: "Começar Grátis",
      popular: false
    },
    {
      name: "Profissional",
      price: "R$ 297",
      period: "/mês",
      description: "Para institutos e empresas de pesquisa",
      features: [
        "Até 2.000 entrevistas/mês",
        "10 pesquisas ativas",
        "15 usuários",
        "GPS + Áudio obrigatórios",
        "Detecção avançada de fraudes",
        "Exportação CSV/Excel",
        "Suporte prioritário",
        "API de integração"
      ],
      cta: "Teste 14 dias grátis",
      popular: true
    },
    {
      name: "Enterprise",
      price: "Sob consulta",
      period: "",
      description: "Soluções personalizadas para grandes operações",
      features: [
        "Entrevistas ilimitadas",
        "Pesquisas ilimitadas",
        "Usuários ilimitados",
        "White-label disponível",
        "SLA garantido",
        "Gerente de conta dedicado",
        "Treinamento presencial",
        "Integrações customizadas"
      ],
      cta: "Falar com Vendas",
      popular: false
    }
  ];

  const testimonials = [
    {
      quote: "O Veracity revolucionou nossa operação de campo. A detecção de fraudes em tempo real nos dá confiança total nos dados coletados.",
      author: "Maria Silva",
      role: "Diretora de Pesquisa",
      company: "Instituto DataBrasil"
    },
    {
      quote: "Antes perdíamos horas verificando inconsistências. Agora o sistema faz isso automaticamente e nossos clientes confiam mais nos resultados.",
      author: "Carlos Santos",
      role: "Coordenador de Campo",
      company: "Pesquisas Nacionais Ltda"
    },
    {
      quote: "A interface é intuitiva e nossos entrevistadores se adaptaram rapidamente. O suporte é excelente.",
      author: "Ana Oliveira",
      role: "Gerente de Operações",
      company: "OpinionPoll Brasil"
    }
  ];

  const faqs = [
    {
      question: "Como funciona a gravação de áudio?",
      answer: "O aplicativo grava automaticamente o áudio de cada entrevista quando o entrevistador inicia a coleta. A gravação é obrigatória e fica vinculada à resposta, permitindo auditoria posterior. Os arquivos são criptografados e armazenados de forma segura."
    },
    {
      question: "O sistema funciona offline?",
      answer: "Sim! O aplicativo de coleta funciona mesmo sem internet. Os dados são armazenados localmente e sincronizados automaticamente quando a conexão é restabelecida. O GPS e áudio continuam funcionando normalmente."
    },
    {
      question: "Como é feita a detecção de fraudes?",
      answer: "Utilizamos múltiplas camadas de verificação: precisão do GPS (detectamos localização imprecisa), duração da entrevista (muito rápida indica problemas), padrões de resposta e fingerprint do dispositivo. Entrevistas suspeitas são marcadas automaticamente para revisão."
    },
    {
      question: "Os dados estão em conformidade com a LGPD?",
      answer: "Absolutamente. Todos os dados são criptografados em trânsito e em repouso. Implementamos controles de acesso rigorosos, logs de auditoria e políticas de retenção configuráveis. Fornecemos também termos de consentimento personalizáveis."
    },
    {
      question: "Posso exportar os dados?",
      answer: "Sim, nos planos Profissional e Enterprise você pode exportar todos os dados em formatos CSV e Excel. Também oferecemos API REST para integração com seus sistemas de análise."
    },
    {
      question: "Qual a precisão do GPS exigida?",
      answer: "Por padrão, exigimos precisão de até 50 metros. Entrevistas com precisão menor são automaticamente marcadas como suspeitas. Você pode configurar esse limite de acordo com suas necessidades."
    }
  ];

  const stats = [
    { value: "2M+", label: "Entrevistas Realizadas" },
    { value: "99.7%", label: "Uptime Garantido" },
    { value: "500+", label: "Institutos Confiam" },
    { value: "<2s", label: "Tempo de Sincronização" }
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/80 backdrop-blur-md fixed w-full z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold font-display text-lg">V</div>
            <span className="font-display font-bold text-xl tracking-tight">Veracity</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm">
            <a href="#recursos" className="text-muted-foreground hover:text-foreground transition-colors" data-testid="link-recursos">Recursos</a>
            <a href="#planos" className="text-muted-foreground hover:text-foreground transition-colors" data-testid="link-planos">Planos</a>
            <a href="#faq" className="text-muted-foreground hover:text-foreground transition-colors" data-testid="link-faq">FAQ</a>
          </nav>
          <div className="flex items-center gap-3">
            {user ? (
              <Link href="/dashboard">
                <Button data-testid="button-dashboard">Ir para o Painel</Button>
              </Link>
            ) : (
              <>
                <Link href="/auth">
                  <Button variant="ghost" data-testid="button-login">Entrar</Button>
                </Link>
                <Link href="/auth">
                  <Button data-testid="button-signup">Criar Conta</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        {/* Hero Section */}
        <section className="pt-28 pb-20 px-4 bg-gradient-to-b from-primary/5 to-background">
          <div className="max-w-7xl mx-auto">
            <div className="text-center max-w-4xl mx-auto mb-12">
              <Badge variant="secondary" className="mb-6 px-4 py-1.5">
                <ShieldCheck className="w-4 h-4 mr-2" />
                Plataforma Líder em Pesquisas Eleitorais Auditáveis
              </Badge>
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-display font-bold text-foreground mb-6 leading-tight">
                Pesquisas Eleitorais com{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-primary to-accent">
                  Provas Irrefutáveis
                </span>
              </h1>
              <p className="text-lg sm:text-xl text-muted-foreground mb-8 leading-relaxed max-w-2xl mx-auto">
                Capture GPS, áudio e impressão digital do dispositivo em cada entrevista. 
                Detecte fraudes em tempo real e entregue resultados que seus clientes podem confiar.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
                <Link href="/auth">
                  <Button size="lg" className="w-full sm:w-auto px-8 h-12 text-base gap-2" data-testid="button-start-trial">
                    Começar Gratuitamente <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
                <Button size="lg" variant="outline" className="w-full sm:w-auto px-8 h-12 text-base" data-testid="button-demo">
                  Ver Demonstração
                </Button>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
              {stats.map((stat, i) => (
                <div key={i} className="text-center p-4">
                  <div className="text-3xl md:text-4xl font-display font-bold text-primary mb-1">{stat.value}</div>
                  <div className="text-sm text-muted-foreground">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="recursos" className="py-20 px-4">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">
                Tecnologia Anti-Fraude de Ponta
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Cada entrevista é validada automaticamente com múltiplas camadas de verificação
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {[
                {
                  icon: MapPin,
                  title: "Verificação GPS Precisa",
                  description: "Localização exata de cada entrevista com timestamp. Detecte automaticamente precisão baixa e localizações suspeitas.",
                  color: "text-blue-600"
                },
                {
                  icon: Mic,
                  title: "Gravação de Áudio Obrigatória",
                  description: "Áudio completo de cada entrevista para auditoria. Impossível fabricar dados sem evidência de conversa real.",
                  color: "text-green-600"
                },
                {
                  icon: ShieldCheck,
                  title: "Detecção de Fraudes em Tempo Real",
                  description: "Algoritmos identificam padrões suspeitos: entrevistas muito rápidas, respostas repetitivas, GPS impreciso.",
                  color: "text-orange-600"
                }
              ].map((feature, i) => (
                <Card key={i} className="p-8 hover:shadow-lg transition-shadow" data-testid={`card-feature-${i}`}>
                  <div className={`w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center ${feature.color} mb-6`}>
                    <feature.icon className="w-7 h-7" />
                  </div>
                  <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
                </Card>
              ))}
            </div>

            {/* Secondary Features */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mt-12">
              {[
                { icon: Clock, title: "Sincronização Instantânea", description: "Dados disponíveis em segundos" },
                { icon: BarChart3, title: "Dashboards em Tempo Real", description: "Acompanhe o progresso ao vivo" },
                { icon: FileCheck, title: "Trilha de Auditoria Completa", description: "Histórico de todas as ações" },
                { icon: Users, title: "Gestão de Equipes", description: "Coordenadores e entrevistadores" }
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-4 p-4">
                  <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center text-accent shrink-0">
                    <item.icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-semibold mb-1">{item.title}</h4>
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Social Proof / Testimonials */}
        <section className="py-20 px-4 bg-muted/30">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">
                Utilizado pelos Melhores Institutos
              </h2>
              <p className="text-lg text-muted-foreground">
                Veja o que nossos clientes dizem sobre o Veracity
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {testimonials.map((testimonial, i) => (
                <Card key={i} className="p-6" data-testid={`card-testimonial-${i}`}>
                  <CardContent className="p-0">
                    <div className="flex gap-1 mb-4">
                      {[...Array(5)].map((_, j) => (
                        <Star key={j} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                      ))}
                    </div>
                    <p className="text-muted-foreground mb-6 leading-relaxed">"{testimonial.quote}"</p>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                        {testimonial.author.charAt(0)}
                      </div>
                      <div>
                        <div className="font-semibold text-sm">{testimonial.author}</div>
                        <div className="text-xs text-muted-foreground">{testimonial.role}, {testimonial.company}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <section id="planos" className="py-20 px-4">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">
                Planos para Cada Necessidade
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Comece grátis e escale conforme sua operação cresce
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              {plans.map((plan, i) => (
                <Card 
                  key={i} 
                  className={`p-6 relative ${plan.popular ? 'border-primary shadow-lg scale-105' : ''}`}
                  data-testid={`card-plan-${plan.name.toLowerCase()}`}
                >
                  {plan.popular && (
                    <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">
                      Mais Popular
                    </Badge>
                  )}
                  <CardHeader className="p-0 pb-4">
                    <CardTitle className="text-xl">{plan.name}</CardTitle>
                    <CardDescription>{plan.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="mb-6">
                      <span className="text-4xl font-display font-bold">{plan.price}</span>
                      <span className="text-muted-foreground">{plan.period}</span>
                    </div>
                    <ul className="space-y-3 mb-6">
                      {plan.features.map((feature, j) => (
                        <li key={j} className="flex items-start gap-2 text-sm">
                          <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                    <Link href="/auth">
                      <Button 
                        className="w-full" 
                        variant={plan.popular ? "default" : "outline"}
                        data-testid={`button-plan-${plan.name.toLowerCase()}`}
                      >
                        {plan.cta}
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Benefits Section */}
        <section className="py-20 px-4 bg-muted/30">
          <div className="max-w-7xl mx-auto">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <h2 className="text-3xl md:text-4xl font-display font-bold mb-6">
                  Por que Institutos Escolhem o Veracity?
                </h2>
                <div className="space-y-6">
                  {[
                    { icon: Lock, title: "Conformidade LGPD", description: "Dados criptografados, controle de acesso rigoroso e políticas de retenção configuráveis." },
                    { icon: Smartphone, title: "Funciona Offline", description: "Colete dados em áreas sem internet. Sincronização automática quando conectado." },
                    { icon: TrendingUp, title: "Escala sem Limites", description: "De 100 a 100.000 entrevistas. Nossa infraestrutura cresce com você." },
                    { icon: Award, title: "Qualidade IBOPE/Datafolha", description: "Padrões de coleta comparáveis aos maiores institutos do Brasil." }
                  ].map((benefit, i) => (
                    <div key={i} className="flex gap-4">
                      <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                        <benefit.icon className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="font-bold mb-1">{benefit.title}</h3>
                        <p className="text-muted-foreground text-sm">{benefit.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-card rounded-2xl border p-8 text-center">
                <div className="w-24 h-24 mx-auto bg-primary/10 rounded-full flex items-center justify-center mb-6">
                  <Zap className="w-12 h-12 text-primary" />
                </div>
                <h3 className="text-2xl font-display font-bold mb-3">Comece em 5 Minutos</h3>
                <p className="text-muted-foreground mb-6">
                  Crie sua conta, configure sua primeira pesquisa e comece a coletar dados com segurança hoje mesmo.
                </p>
                <Link href="/auth">
                  <Button size="lg" className="gap-2" data-testid="button-quick-start">
                    Criar Conta Grátis <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section id="faq" className="py-20 px-4">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">
                Perguntas Frequentes
              </h2>
              <p className="text-lg text-muted-foreground">
                Tire suas dúvidas sobre a plataforma
              </p>
            </div>

            <Accordion type="single" collapsible className="w-full">
              {faqs.map((faq, i) => (
                <AccordionItem key={i} value={`item-${i}`} data-testid={`accordion-faq-${i}`}>
                  <AccordionTrigger className="text-left" data-testid={`button-faq-${i}`}>{faq.question}</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-20 px-4 bg-primary text-primary-foreground">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">
              Pronto para Revolucionar suas Pesquisas?
            </h2>
            <p className="text-lg opacity-90 mb-8 max-w-2xl mx-auto">
              Junte-se a centenas de institutos que já confiam no Veracity para entregar resultados precisos e auditáveis.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/auth">
                <Button size="lg" variant="secondary" className="px-8 h-12 text-base gap-2" data-testid="button-final-cta">
                  Criar Conta Grátis <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <Button size="lg" variant="outline" className="px-8 h-12 text-base border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10" data-testid="button-contact-specialist">
                Falar com Especialista
              </Button>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-12 px-4 border-t">
          <div className="max-w-7xl mx-auto">
            <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-8 mb-8">
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold">V</div>
                  <span className="font-display font-bold text-lg">Veracity</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Plataforma líder em pesquisas eleitorais com auditoria em tempo real.
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-3">Produto</h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li><a href="#recursos" className="hover:text-foreground transition-colors">Recursos</a></li>
                  <li><a href="#planos" className="hover:text-foreground transition-colors">Planos</a></li>
                  <li><a href="#" className="hover:text-foreground transition-colors">API</a></li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-3">Suporte</h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li><a href="#faq" className="hover:text-foreground transition-colors">FAQ</a></li>
                  <li><a href="#" className="hover:text-foreground transition-colors">Documentação</a></li>
                  <li><a href="#" className="hover:text-foreground transition-colors">Contato</a></li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-3">Legal</h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li><a href="#" className="hover:text-foreground transition-colors">Termos de Uso</a></li>
                  <li><a href="#" className="hover:text-foreground transition-colors">Privacidade</a></li>
                  <li><a href="#" className="hover:text-foreground transition-colors">LGPD</a></li>
                </ul>
              </div>
            </div>
            <div className="pt-8 border-t text-center text-sm text-muted-foreground">
              <p>© 2025 Veracity. Todos os direitos reservados.</p>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
