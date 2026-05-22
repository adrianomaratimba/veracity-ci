import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2, LogOut, Mail, Clock } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export default function NoOrganizationPage() {
  const { logout, isLoggingOut } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-muted flex items-center justify-center">
            <Clock className="w-8 h-8 text-muted-foreground" />
          </div>
          <CardTitle className="text-2xl">Aguardando Acesso</CardTitle>
          <CardDescription>
            Sua conta ainda não está vinculada a nenhuma organização
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            <div className="flex items-start gap-3">
              <Building2 className="w-5 h-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="font-medium text-sm">Precisa de uma organização</p>
                <p className="text-sm text-muted-foreground">
                  Para acessar o Data Veracity, você precisa ser adicionado a uma organização por um administrador.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Mail className="w-5 h-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="font-medium text-sm">Entre em contato</p>
                <p className="text-sm text-muted-foreground">
                  Se você deveria ter acesso, entre em contato com o administrador da sua organização.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3" data-testid="container-actions">
            <Button 
              variant="outline" 
              className="w-full gap-2"
              onClick={() => window.location.reload()}
              data-testid="button-refresh-access"
            >
              Verificar novamente
            </Button>
            <Button 
              variant="ghost" 
              className="w-full gap-2"
              onClick={() => logout()}
              disabled={isLoggingOut}
              data-testid="button-logout-no-org"
            >
              <LogOut className="w-4 h-4" />
              {isLoggingOut ? "Saindo..." : "Sair da conta"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
