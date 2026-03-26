import { usePWA } from "@/hooks/use-pwa";
import { WifiOff, Download, Check, Share, X, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export function OfflineIndicator() {
  const {
    isOnline,
    isInstallable,
    isInstalled,
    isIOSSafari,
    showIOSInstructions,
    dismissIOSInstructions,
    installApp,
  } = usePWA();
  const { toast } = useToast();

  const handleInstall = async () => {
    const success = await installApp();
    if (success) {
      toast({
        title: "App instalado!",
        description: "Veracity foi adicionado à sua tela inicial.",
      });
    }
  };

  if (isOnline && !isInstallable) return null;

  return (
    <>
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

      {/* iOS Safari install instructions panel */}
      {isIOSSafari && showIOSInstructions && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center p-4 bg-black/40"
          onClick={dismissIOSInstructions}
          data-testid="overlay-ios-install"
        >
          <div
            className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-5 pb-8 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-gray-900">Adicionar à Tela de Início</h3>
              <button
                onClick={dismissIOSInstructions}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 text-gray-500"
                data-testid="button-dismiss-ios-install"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-sm text-gray-600">
              No Safari, siga os passos abaixo para instalar o app na tela inicial do seu iPhone:
            </p>

            {/* Step 1 */}
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">1</div>
              <div>
                <p className="text-sm font-medium text-gray-800">Toque no botão Compartilhar</p>
                <div className="flex items-center gap-1 mt-1">
                  <div className="bg-blue-100 rounded-lg p-1.5">
                    <Share className="w-5 h-5 text-blue-600" />
                  </div>
                  <ArrowUp className="w-3 h-3 text-gray-400" />
                  <p className="text-xs text-gray-500">Botão na barra inferior do Safari</p>
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">2</div>
              <div>
                <p className="text-sm font-medium text-gray-800">Role para baixo e toque em</p>
                <div className="mt-1 flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2 w-fit">
                  <Download className="w-4 h-4 text-gray-600" />
                  <span className="text-sm font-medium text-gray-700">Adicionar à Tela de Início</span>
                </div>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">3</div>
              <div>
                <p className="text-sm font-medium text-gray-800">Toque em <strong>Adicionar</strong> no canto superior direito</p>
                <p className="text-xs text-gray-500 mt-0.5">O app aparecerá na sua tela inicial como um ícone</p>
              </div>
            </div>

            <Button className="w-full mt-2" onClick={dismissIOSInstructions}>
              Entendi
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
