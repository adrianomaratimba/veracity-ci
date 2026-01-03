import { usePWA } from "@/hooks/use-pwa";
import { WifiOff, Download, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export function OfflineIndicator() {
  const { isOnline, isInstallable, isInstalled, installApp } = usePWA();
  const { toast } = useToast();

  const handleInstall = async () => {
    const success = await installApp();
    if (success) {
      toast({
        title: "App instalado!",
        description: "VotoAudit foi adicionado à sua tela inicial."
      });
    }
  };

  if (isOnline && !isInstallable) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex flex-col gap-2">
      {!isOnline && (
        <div className="flex items-center gap-2 bg-amber-500 text-white px-4 py-2 rounded-lg shadow-lg animate-pulse">
          <WifiOff className="w-4 h-4" />
          <span className="text-sm font-medium">Modo Offline</span>
        </div>
      )}
      
      {isInstallable && !isInstalled && (
        <Button
          onClick={handleInstall}
          className="gap-2 shadow-lg"
          data-testid="button-install-pwa"
        >
          <Download className="w-4 h-4" />
          Instalar App
        </Button>
      )}

      {isInstalled && (
        <div className="flex items-center gap-2 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg">
          <Check className="w-4 h-4" />
          <span className="text-sm font-medium">App Instalado</span>
        </div>
      )}
    </div>
  );
}
