import { usePWAContext } from "@/contexts/pwa-context";
import { WifiOff, Share, X, ArrowUp, Smartphone, MoreVertical, Cloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { addSyncListener, syncAllPending } from "@/lib/syncQueue";
import { getPendingCount } from "@/lib/offlineStorage";
import { useLocation } from "wouter";

export function OfflineIndicator() {
  const {
    isOnline,
    isIOSSafari,
    showIOSInstructions,
    showAndroidInstructions,
    dismissIOSInstructions,
    dismissAndroidInstructions,
  } = usePWAContext();

  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [location] = useLocation();

  // Don't show global indicator inside interview-session (has its own)
  const isInsideCollection = location.startsWith('/collect/survey/');

  useEffect(() => {
    // Initialize with current count
    getPendingCount().then(setPendingCount).catch(() => {});

    // Listen for sync status updates
    const unsub = addSyncListener((status) => {
      setPendingCount(status.pendingCount);
      setIsSyncing(status.isSyncing);
    });
    return unsub;
  }, []);

  // Trigger sync when coming back online
  useEffect(() => {
    if (isOnline && pendingCount > 0) {
      syncAllPending().catch(() => {});
    }
  }, [isOnline]);

  const showNothing = isOnline && !showIOSInstructions && !showAndroidInstructions && pendingCount === 0;
  if (showNothing) return null;

  return (
    <>
      {/* Offline badge */}
      {!isOnline && (
        <div className="fixed bottom-20 left-4 z-50">
          <div className="flex items-center gap-2 bg-amber-500 text-white px-4 py-2 rounded-lg shadow-lg animate-pulse">
            <WifiOff className="w-4 h-4" />
            <span className="text-sm font-medium">Modo Offline</span>
          </div>
        </div>
      )}

      {/* Global pending interviews indicator — shown on all pages except collection */}
      {pendingCount > 0 && !isInsideCollection && (
        <div className="fixed bottom-4 left-4 z-50">
          <button
            onClick={() => { window.location.href = '/collect/pending'; }}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-3 py-2 rounded-lg shadow-lg hover:bg-primary/90 transition-colors"
            data-testid="button-global-pending-sync"
          >
            <Cloud className={`w-4 h-4 ${isSyncing ? 'animate-pulse' : ''}`} />
            <span className="text-sm font-medium">
              {isSyncing ? 'Enviando...' : `${pendingCount} pendente${pendingCount > 1 ? 's' : ''}`}
            </span>
          </button>
        </div>
      )}

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
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-gray-900">Instalar no iPhone / iPad</h3>
              <button
                onClick={dismissIOSInstructions}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 text-gray-500"
                data-testid="button-dismiss-ios-install"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-sm text-gray-600">
              No Safari, siga os passos abaixo para instalar o app na tela inicial:
            </p>

            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">1</div>
              <div>
                <p className="text-sm font-medium text-gray-800">Toque no botão Compartilhar</p>
                <div className="flex items-center gap-1 mt-1">
                  <div className="bg-blue-100 rounded-lg p-1.5">
                    <Share className="w-5 h-5 text-blue-600" />
                  </div>
                  <ArrowUp className="w-3 h-3 text-gray-400" />
                  <p className="text-xs text-gray-500">Barra inferior do Safari</p>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">2</div>
              <div>
                <p className="text-sm font-medium text-gray-800">Toque em</p>
                <div className="mt-1 flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2 w-fit">
                  <Smartphone className="w-4 h-4 text-gray-600" />
                  <span className="text-sm font-medium text-gray-700">Adicionar à Tela de Início</span>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">3</div>
              <div>
                <p className="text-sm font-medium text-gray-800">Toque em <strong>Adicionar</strong> no canto superior direito</p>
                <p className="text-xs text-gray-500 mt-0.5">O app aparecerá na tela inicial como um ícone</p>
              </div>
            </div>

            <Button className="w-full mt-2" onClick={dismissIOSInstructions}>
              Entendi
            </Button>
          </div>
        </div>
      )}

      {/* Android / Desktop manual install instructions panel */}
      {showAndroidInstructions && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center p-4 bg-black/40"
          onClick={dismissAndroidInstructions}
          data-testid="overlay-android-install"
        >
          <div
            className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-5 pb-8 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-gray-900">Instalar no Android</h3>
              <button
                onClick={dismissAndroidInstructions}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 text-gray-500"
                data-testid="button-dismiss-android-install"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-sm text-gray-600">
              Use o <strong>Google Chrome</strong> e siga os passos:
            </p>

            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-green-600 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">1</div>
              <div>
                <p className="text-sm font-medium text-gray-800">Toque nos 3 pontos no canto superior direito</p>
                <div className="flex items-center gap-1 mt-1">
                  <div className="bg-gray-100 rounded-lg p-1.5">
                    <MoreVertical className="w-5 h-5 text-gray-600" />
                  </div>
                  <p className="text-xs text-gray-500">Menu do Chrome</p>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-green-600 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">2</div>
              <div>
                <p className="text-sm font-medium text-gray-800">Toque em</p>
                <div className="mt-1 flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2 w-fit">
                  <Smartphone className="w-4 h-4 text-gray-600" />
                  <span className="text-sm font-medium text-gray-700">Instalar app</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">Ou "Adicionar à tela inicial"</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-green-600 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">3</div>
              <div>
                <p className="text-sm font-medium text-gray-800">Confirme tocando em <strong>Instalar</strong></p>
                <p className="text-xs text-gray-500 mt-0.5">O ícone aparecerá na tela inicial e o app abrirá sem o navegador</p>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <p className="text-xs text-amber-700">
                <strong>Importante:</strong> Se instalou antes como "atalho", remova-o e reinstale seguindo esses passos para abrir como app.
              </p>
            </div>

            <Button className="w-full mt-2" onClick={dismissAndroidInstructions}>
              Entendi
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
