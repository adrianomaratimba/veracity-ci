import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail, Lock, User, ArrowLeft, Check } from "lucide-react";
import { Link } from "wouter";

const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "Senha é obrigatória"),
});

const registerSchema = z.object({
  firstName: z.string().min(1, "Nome é obrigatório"),
  lastName: z.string().min(1, "Sobrenome é obrigatório"),
  email: z.string().email("Email inválido"),
  password: z.string().min(8, "Senha deve ter pelo menos 8 caracteres"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "As senhas não coincidem",
  path: ["confirmPassword"],
});

type LoginFormData = z.infer<typeof loginSchema>;
type RegisterFormData = z.infer<typeof registerSchema>;

const planDetails: Record<string, { name: string; price: string; features: string[] }> = {
  "básico": { name: "Básico", price: "Grátis", features: ["100 entrevistas/mês", "1 pesquisa", "3 usuários"] },
  "profissional": { name: "Profissional", price: "R$ 297/mês", features: ["2.000 entrevistas/mês", "10 pesquisas", "15 usuários"] },
};

export default function AuthPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const { toast } = useToast();
  
  const params = new URLSearchParams(searchString);
  const selectedPlan = params.get("plan");
  const plan = selectedPlan ? planDetails[selectedPlan] : null;
  
  useEffect(() => {
    if (selectedPlan) {
      setMode("register");
    }
  }, [selectedPlan]);

  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const registerForm = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: { firstName: "", lastName: "", email: "", password: "", confirmPassword: "" },
  });

  const loginMutation = useMutation({
    mutationFn: async (data: LoginFormData) => {
      const res = await apiRequest("POST", "/api/auth/login", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "Login realizado com sucesso!" });
      setLocation("/dashboard");
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao fazer login", description: error.message, variant: "destructive" });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: RegisterFormData) => {
      const { confirmPassword, ...registerData } = data;
      const res = await apiRequest("POST", "/api/auth/register", registerData);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: "Conta criada com sucesso!", 
        description: "Você já pode fazer login com suas credenciais."
      });
      setMode("login");
      registerForm.reset();
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao criar conta", description: error.message, variant: "destructive" });
    },
  });

  const onLoginSubmit = (data: LoginFormData) => {
    loginMutation.mutate(data);
  };

  const onRegisterSubmit = (data: RegisterFormData) => {
    registerMutation.mutate(data);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/30 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/">
            <Button variant="ghost" size="sm" className="mb-4 gap-2" data-testid="button-back-home">
              <ArrowLeft className="w-4 h-4" />
              Voltar para o início
            </Button>
          </Link>
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold font-display text-lg">V</div>
            <span className="font-display font-bold text-2xl tracking-tight">Veracity</span>
          </div>
        </div>

        {plan && mode === "register" && (
          <Card className="mb-4 border-primary/50 bg-primary/5">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Badge variant="default">{plan.name}</Badge>
                  <span className="font-semibold">{plan.price}</span>
                </div>
                <Link href="/auth">
                  <Button variant="ghost" size="sm" data-testid="button-change-plan">
                    Alterar
                  </Button>
                </Link>
              </div>
              <ul className="text-sm text-muted-foreground space-y-1">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <Check className="w-3 h-3 text-primary" />
                    {feature}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl text-center">
              {mode === "login" ? "Entrar" : "Criar Conta"}
            </CardTitle>
            <CardDescription className="text-center">
              {mode === "login" 
                ? "Entre com seu email e senha para acessar a plataforma"
                : plan 
                  ? `Crie sua conta para iniciar o plano ${plan.name}`
                  : "Preencha os dados abaixo para criar sua conta"
              }
            </CardDescription>
          </CardHeader>

          <CardContent>
            {mode === "login" ? (
              <Form {...loginForm}>
                <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="space-y-4">
                  <FormField
                    control={loginForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                            <Input 
                              type="email"
                              autoComplete="email"
                              placeholder="seu@email.com" 
                              className="pl-10" 
                              data-testid="input-login-email"
                              {...field} 
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={loginForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Senha</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                            <Input 
                              type="password"
                              autoComplete="current-password"
                              placeholder="Sua senha" 
                              className="pl-10" 
                              data-testid="input-login-password"
                              {...field} 
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button 
                    type="submit" 
                    className="w-full" 
                    disabled={loginMutation.isPending}
                    data-testid="button-submit-login"
                  >
                    {loginMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Entrando...
                      </>
                    ) : "Entrar"}
                  </Button>

                  <div className="text-center">
                    <Link href="/reset-password" className="text-sm text-muted-foreground hover:text-primary transition-colors" data-testid="link-forgot-password">
                      Esqueci minha senha
                    </Link>
                  </div>
                </form>
              </Form>
            ) : (
              <Form {...registerForm}>
                <form onSubmit={registerForm.handleSubmit(onRegisterSubmit)} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={registerForm.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nome</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                              <Input 
                                autoComplete="given-name"
                                placeholder="Nome" 
                                className="pl-10" 
                                data-testid="input-register-firstname"
                                {...field} 
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={registerForm.control}
                      name="lastName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Sobrenome</FormLabel>
                          <FormControl>
                            <Input 
                              autoComplete="family-name"
                              placeholder="Sobrenome" 
                              data-testid="input-register-lastname"
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="register-email">Email</Label>
                    <Input 
                      id="register-email"
                      type="email"
                      autoComplete="email"
                      placeholder="seu@email.com"
                      data-testid="input-register-email"
                      {...registerForm.register("email")}
                    />
                    {registerForm.formState.errors.email && (
                      <p className="text-sm font-medium text-destructive">
                        {registerForm.formState.errors.email.message}
                      </p>
                    )}
                  </div>

                  <FormField
                    control={registerForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Senha</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                            <Input 
                              type="password"
                              autoComplete="new-password"
                              placeholder="Mínimo 8 caracteres" 
                              className="pl-10" 
                              data-testid="input-register-password"
                              {...field} 
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={registerForm.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirmar Senha</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                            <Input 
                              type="password"
                              autoComplete="new-password"
                              placeholder="Repita a senha" 
                              className="pl-10" 
                              data-testid="input-register-confirm-password"
                              {...field} 
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button 
                    type="submit" 
                    className="w-full" 
                    disabled={registerMutation.isPending}
                    data-testid="button-submit-register"
                  >
                    {registerMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Criando conta...
                      </>
                    ) : "Criar Conta"}
                  </Button>
                </form>
              </Form>
            )}

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">ou</span>
              </div>
            </div>

            <Button 
              variant="outline" 
              className="w-full" 
              onClick={() => window.location.href = "/api/login"}
              data-testid="button-replit-login"
            >
              Entrar com Replit
            </Button>
          </CardContent>

          <CardFooter className="flex justify-center">
            {mode === "login" ? (
              <p className="text-sm text-muted-foreground">
                Não tem uma conta?{" "}
                <button 
                  type="button"
                  onClick={() => setMode("register")} 
                  className="text-primary hover:underline font-medium"
                  data-testid="button-switch-to-register"
                >
                  Criar conta
                </button>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Já tem uma conta?{" "}
                <button 
                  type="button"
                  onClick={() => setMode("login")} 
                  className="text-primary hover:underline font-medium"
                  data-testid="button-switch-to-login"
                >
                  Fazer login
                </button>
              </p>
            )}
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
