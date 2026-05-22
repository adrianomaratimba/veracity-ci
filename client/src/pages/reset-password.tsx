import { useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Lock, CheckCircle, Mail, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

const requestResetSchema = z.object({
  email: z.string().email("Email inválido"),
});

const resetPasswordSchema = z.object({
  password: z.string().min(8, "Senha deve ter pelo menos 8 caracteres"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "As senhas não coincidem",
  path: ["confirmPassword"],
});

type RequestResetFormData = z.infer<typeof requestResetSchema>;
type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;

export default function ResetPasswordPage() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const token = params.get("token");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [emailSent, setEmailSent] = useState(false);
  const [resetComplete, setResetComplete] = useState(false);

  const requestForm = useForm<RequestResetFormData>({
    resolver: zodResolver(requestResetSchema),
    defaultValues: { email: "" },
  });

  const resetForm = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const requestResetMutation = useMutation({
    mutationFn: async (data: RequestResetFormData) => {
      const res = await apiRequest("POST", "/api/auth/request-password-reset", data);
      return res.json();
    },
    onSuccess: () => {
      setEmailSent(true);
    },
    onError: (error: Error) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (data: ResetPasswordFormData) => {
      const res = await apiRequest("POST", "/api/auth/reset-password", { 
        token, 
        password: data.password 
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Erro ao redefinir senha");
      }
      return res.json();
    },
    onSuccess: () => {
      setResetComplete(true);
      toast({ title: "Senha redefinida com sucesso!" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const onRequestSubmit = (data: RequestResetFormData) => {
    requestResetMutation.mutate(data);
  };

  const onResetSubmit = (data: ResetPasswordFormData) => {
    resetPasswordMutation.mutate(data);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/30 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/auth">
            <Button variant="ghost" size="sm" className="mb-4 gap-2" data-testid="button-back-login">
              <ArrowLeft className="w-4 h-4" />
              Voltar para o login
            </Button>
          </Link>
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold font-display text-lg">V</div>
            <span className="font-display font-bold text-2xl tracking-tight">Data Veracity</span>
          </div>
        </div>

        <Card>
          {!token ? (
            <>
              <CardHeader className="space-y-1">
                <CardTitle className="text-2xl text-center">
                  {emailSent ? "Email enviado" : "Recuperar senha"}
                </CardTitle>
                <CardDescription className="text-center">
                  {emailSent 
                    ? "Verifique sua caixa de entrada para o link de recuperação"
                    : "Digite seu email para receber o link de recuperação"
                  }
                </CardDescription>
              </CardHeader>

              <CardContent>
                {emailSent ? (
                  <div className="text-center space-y-4">
                    <div className="flex justify-center">
                      <Mail className="w-12 h-12 text-primary" />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Se o email estiver cadastrado, você receberá as instruções em alguns minutos.
                    </p>
                    <Link href="/auth">
                      <Button variant="outline" className="w-full" data-testid="button-back-to-login">
                        Voltar para o Login
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <Form {...requestForm}>
                    <form onSubmit={requestForm.handleSubmit(onRequestSubmit)} className="space-y-4">
                      <FormField
                        control={requestForm.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <Input 
                                  placeholder="seu@email.com" 
                                  className="pl-10" 
                                  data-testid="input-reset-email"
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
                        disabled={requestResetMutation.isPending}
                        data-testid="button-request-reset"
                      >
                        {requestResetMutation.isPending ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Enviando...
                          </>
                        ) : "Enviar link de recuperação"}
                      </Button>
                    </form>
                  </Form>
                )}
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader className="space-y-1 text-center">
                {resetComplete ? (
                  <>
                    <div className="flex justify-center mb-4">
                      <CheckCircle className="w-12 h-12 text-green-500" />
                    </div>
                    <CardTitle className="text-2xl text-green-600">Senha redefinida!</CardTitle>
                    <CardDescription>Sua senha foi alterada com sucesso</CardDescription>
                  </>
                ) : (
                  <>
                    <CardTitle className="text-2xl">Nova senha</CardTitle>
                    <CardDescription>Digite sua nova senha</CardDescription>
                  </>
                )}
              </CardHeader>

              <CardContent>
                {resetComplete ? (
                  <Link href="/auth">
                    <Button className="w-full" data-testid="button-go-to-login-after-reset">
                      Ir para o Login
                    </Button>
                  </Link>
                ) : (
                  <Form {...resetForm}>
                    <form onSubmit={resetForm.handleSubmit(onResetSubmit)} className="space-y-4">
                      <FormField
                        control={resetForm.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Nova senha</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <Input 
                                  type="password" 
                                  placeholder="Mínimo 8 caracteres" 
                                  className="pl-10" 
                                  data-testid="input-new-password"
                                  {...field} 
                                />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={resetForm.control}
                        name="confirmPassword"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Confirmar senha</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <Input 
                                  type="password" 
                                  placeholder="Confirme a nova senha" 
                                  className="pl-10" 
                                  data-testid="input-confirm-new-password"
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
                        disabled={resetPasswordMutation.isPending}
                        data-testid="button-reset-password"
                      >
                        {resetPasswordMutation.isPending ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Redefinindo...
                          </>
                        ) : "Redefinir senha"}
                      </Button>
                    </form>
                  </Form>
                )}
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
