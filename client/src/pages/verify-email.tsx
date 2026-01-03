import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, CheckCircle, XCircle, Mail } from "lucide-react";
import { Link } from "wouter";

export default function VerifyEmailPage() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const token = params.get("token");
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");

  const verifyMutation = useMutation({
    mutationFn: async (token: string) => {
      const res = await apiRequest("POST", "/api/auth/verify-email", { token });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Erro ao verificar email");
      }
      return res.json();
    },
    onSuccess: () => {
      setStatus("success");
    },
    onError: (error: Error) => {
      setStatus("error");
      setErrorMessage(error.message);
    },
  });

  useEffect(() => {
    if (token) {
      verifyMutation.mutate(token);
    } else {
      setStatus("error");
      setErrorMessage("Token de verificação não encontrado");
    }
  }, [token]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/30 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold font-display text-lg">VA</div>
            <span className="font-display font-bold text-2xl tracking-tight">VotoAudit</span>
          </div>
        </div>

        <Card>
          <CardHeader className="space-y-1 text-center">
            {status === "loading" && (
              <>
                <div className="flex justify-center mb-4">
                  <Loader2 className="w-12 h-12 animate-spin text-primary" />
                </div>
                <CardTitle className="text-2xl">Verificando email...</CardTitle>
                <CardDescription>Aguarde enquanto confirmamos seu email</CardDescription>
              </>
            )}

            {status === "success" && (
              <>
                <div className="flex justify-center mb-4">
                  <CheckCircle className="w-12 h-12 text-green-500" />
                </div>
                <CardTitle className="text-2xl text-green-600">Email verificado!</CardTitle>
                <CardDescription>Sua conta foi ativada com sucesso</CardDescription>
              </>
            )}

            {status === "error" && (
              <>
                <div className="flex justify-center mb-4">
                  <XCircle className="w-12 h-12 text-destructive" />
                </div>
                <CardTitle className="text-2xl text-destructive">Erro na verificação</CardTitle>
                <CardDescription>{errorMessage}</CardDescription>
              </>
            )}
          </CardHeader>

          <CardContent className="text-center">
            {status === "success" && (
              <Link href="/auth">
                <Button className="w-full" data-testid="button-go-to-login">
                  Ir para o Login
                </Button>
              </Link>
            )}

            {status === "error" && (
              <div className="space-y-2">
                <Link href="/auth">
                  <Button variant="outline" className="w-full" data-testid="button-back-to-auth">
                    Voltar para o Login
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
