import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, ShieldCheck, BarChart3, Radio, Users, Lock, Smartphone, Globe, ArrowRight } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export default function Landing() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/50 backdrop-blur-sm fixed w-full z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold font-display">VA</div>
            <span className="font-display font-bold text-xl tracking-tight">VotoAudit</span>
          </div>
          <div className="flex items-center gap-4">
            {user ? (
               <Link href="/dashboard">
                 <Button data-testid="button-dashboard">Ir para o Painel</Button>
               </Link>
            ) : (
               <Link href="/auth">
                 <Button data-testid="button-login">Entrar</Button>
               </Link>
            )}
          </div>
        </div>
      </header>

      <main className="pt-24 pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/5 text-primary text-sm font-medium mb-6">
              <ShieldCheck className="w-4 h-4" />
              <span>Plataforma Segura de Pesquisas Eleitorais</span>
            </div>
            <h1 className="text-5xl md:text-6xl font-display font-bold text-foreground mb-6 leading-tight">
              Pesquisas com Auditoria <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">e Provas em Tempo Real</span>
            </h1>
            <p className="text-xl text-muted-foreground mb-8 leading-relaxed">
              Realize pesquisas eleitorais com confiança. Capture GPS, evidências de áudio e impressões digitais do dispositivo para cada entrevista.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/auth">
                <Button size="lg" className="w-full sm:w-auto px-8 h-12 text-lg" data-testid="button-start-trial">
                  Iniciar Teste Grátis
                </Button>
              </Link>
              <Button size="lg" variant="outline" className="w-full sm:w-auto px-8 h-12 text-lg" data-testid="button-demo">
                Ver Demonstração
              </Button>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-8 mt-20">
            {[
              {
                icon: Radio,
                title: "Auditoria de Áudio",
                description: "Gravação obrigatória de áudio para cada entrevista garante a integridade dos dados e permite verificação pós-pesquisa."
              },
              {
                icon: CheckCircle2,
                title: "Verificação GPS",
                description: "Rastreamento preciso de localização vincula entrevistas a geofences específicas, prevenindo fraudes e garantindo cobertura."
              },
              {
                icon: BarChart3,
                title: "Análises em Tempo Real",
                description: "Acompanhe os resultados ao vivo. Detecte anomalias instantaneamente com nosso motor de detecção de fraudes."
              }
            ].map((feature, i) => (
              <div key={i} className="bg-card p-8 rounded-2xl border shadow-sm hover:shadow-md transition-shadow" data-testid={`card-feature-${i}`}>
                <div className="w-12 h-12 rounded-xl bg-primary/5 flex items-center justify-center text-primary mb-6">
                  <feature.icon className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>

          <div className="mt-32 mb-20">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">Por que escolher o VotoAudit?</h2>
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                Nossa plataforma foi desenvolvida com os mais altos padrões de qualidade, comparável aos maiores institutos de pesquisa do Brasil.
              </p>
            </div>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { icon: Lock, title: "Conformidade LGPD", description: "Dados protegidos com criptografia e conformidade total com a legislação brasileira." },
                { icon: Smartphone, title: "App Offline", description: "Colete dados mesmo sem internet. Sincronização automática quando conectado." },
                { icon: Users, title: "Multi-Equipe", description: "Gerencie coordenadores e entrevistadores com níveis de acesso personalizados." },
                { icon: Globe, title: "Cobertura Nacional", description: "Suporte para pesquisas em qualquer município brasileiro com geolocalização precisa." },
              ].map((item, i) => (
                <Card key={i} className="text-center p-6" data-testid={`card-benefit-${i}`}>
                  <CardContent className="pt-4">
                    <div className="w-12 h-12 mx-auto rounded-full bg-accent/10 flex items-center justify-center text-accent mb-4">
                      <item.icon className="w-6 h-6" />
                    </div>
                    <h4 className="font-bold mb-2">{item.title}</h4>
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <div className="mt-20 bg-card rounded-2xl border p-8 md:p-12">
            <div className="grid md:grid-cols-2 gap-8 items-center">
              <div>
                <h2 className="text-3xl font-display font-bold mb-4">Comece em minutos</h2>
                <p className="text-muted-foreground mb-6">
                  Configurar sua primeira pesquisa é simples e rápido. Nossa plataforma foi projetada para ser intuitiva, permitindo que você foque no que realmente importa: coletar dados de qualidade.
                </p>
                <ul className="space-y-3">
                  {[
                    "Crie sua organização e configure a equipe",
                    "Desenhe questionários com múltiplos tipos de perguntas",
                    "Distribua para entrevistadores via aplicativo móvel",
                    "Acompanhe resultados em tempo real no painel"
                  ].map((step, i) => (
                    <li key={i} className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">
                        {i + 1}
                      </div>
                      <span className="text-sm">{step}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-muted/50 rounded-xl p-6 text-center">
                <div className="w-20 h-20 mx-auto bg-primary/10 rounded-full flex items-center justify-center mb-4">
                  <ShieldCheck className="w-10 h-10 text-primary" />
                </div>
                <h3 className="text-xl font-bold mb-2">Pronto para começar?</h3>
                <p className="text-muted-foreground text-sm mb-4">
                  Entre com sua conta para criar sua organização e começar a coletar dados com segurança.
                </p>
                <Link href="/auth">
                  <Button className="gap-2" data-testid="button-get-started">
                    Começar Agora <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>

          <div className="mt-32 border-t pt-16 text-center">
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-8">Utilizado por Institutos de Pesquisa</p>
            <div className="flex flex-wrap justify-center gap-12 opacity-50 grayscale hover:grayscale-0 transition-all duration-500">
               <div className="h-8 w-32 bg-foreground/10 rounded animate-pulse" />
               <div className="h-8 w-32 bg-foreground/10 rounded animate-pulse" />
               <div className="h-8 w-32 bg-foreground/10 rounded animate-pulse" />
               <div className="h-8 w-32 bg-foreground/10 rounded animate-pulse" />
            </div>
          </div>

          <footer className="mt-20 pt-8 border-t text-center text-sm text-muted-foreground">
            <p>VotoAudit - Plataforma de Pesquisas Eleitorais com Auditoria</p>
            <p className="mt-2">Cadastre-se gratuitamente e comece a realizar pesquisas com segurança.</p>
          </footer>
        </div>
      </main>
    </div>
  );
}
