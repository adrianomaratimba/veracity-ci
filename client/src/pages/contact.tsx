import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Building2, Mail, Phone, User, Check, Loader2 } from "lucide-react";

export default function ContactPage() {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    company: "",
    email: "",
    phone: "",
    message: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    toast({
      title: "Mensagem enviada!",
      description: "Nossa equipe entrara em contato em ate 24 horas.",
    });
    
    setForm({ name: "", company: "", email: "", phone: "", message: "" });
    setIsSubmitting(false);
  };

  const enterpriseFeatures = [
    "Entrevistas ilimitadas",
    "Pesquisas ilimitadas",
    "Usuarios ilimitados",
    "White-label disponivel",
    "SLA garantido",
    "Gerente de conta dedicado",
    "Treinamento presencial",
    "Integracoes customizadas"
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/30 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        <div className="text-center mb-8">
          <Link href="/">
            <Button variant="ghost" size="sm" className="mb-4 gap-2" data-testid="button-back-home">
              <ArrowLeft className="w-4 h-4" />
              Voltar para o inicio
            </Button>
          </Link>
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold font-display text-lg">V</div>
            <span className="font-display font-bold text-2xl tracking-tight">Data Veracity</span>
          </div>
          <h1 className="text-3xl font-display font-bold mb-2">Plano Enterprise</h1>
          <p className="text-muted-foreground">Solucoes personalizadas para grandes operacoes</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Badge variant="default">Enterprise</Badge>
                <span>Sob consulta</span>
              </CardTitle>
              <CardDescription>
                Para institutos com grandes volumes de pesquisas
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {enterpriseFeatures.map((feature, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-primary shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Fale com nossa equipe</CardTitle>
              <CardDescription>
                Preencha o formulario e entraremos em contato em ate 24h
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome completo</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="name"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="pl-10"
                      placeholder="Seu nome"
                      required
                      data-testid="input-contact-name"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="company">Empresa / Instituto</Label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="company"
                      value={form.company}
                      onChange={(e) => setForm({ ...form, company: e.target.value })}
                      className="pl-10"
                      placeholder="Nome da empresa"
                      required
                      data-testid="input-contact-company"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        className="pl-10"
                        placeholder="seu@email.com"
                        required
                        data-testid="input-contact-email"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">Telefone</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="phone"
                        type="tel"
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                        className="pl-10"
                        placeholder="(00) 00000-0000"
                        data-testid="input-contact-phone"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="message">Mensagem</Label>
                  <Textarea
                    id="message"
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                    placeholder="Conte-nos sobre suas necessidades de pesquisa..."
                    rows={4}
                    data-testid="input-contact-message"
                  />
                </div>

                <Button type="submit" className="w-full" disabled={isSubmitting} data-testid="button-submit-contact">
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Enviando...
                    </>
                  ) : "Enviar mensagem"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
