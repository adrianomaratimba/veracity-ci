import { X, Download, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePWAContext } from "@/contexts/pwa-context";
import { useCurrentMember } from "@/hooks/use-organizations";

interface InstallBannerProps {
  orgId: number;
}

export function InstallBanner({ orgId }: InstallBannerProps) {
  const { isInstallable, isInstalled, isDismissed, promptInstall, dismissBanner } = usePWAContext();
  const { data: member } = useCurrentMember(orgId);

  const isInterviewer = member?.role === 'interviewer';

  if (!isInstallable || isInstalled || isDismissed || !isInterviewer) {
    return null;
  }

  return (
    <div
      className="mt-4 flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4 shadow-sm"
      data-testid="banner-pwa-install"
    >
      <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
        <Smartphone className="w-5 h-5 text-blue-600" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-blue-900">Instale o app no celular</p>
        <p className="text-xs text-blue-700 mt-0.5">
          Trabalhe offline sem depender de internet e acesse mais rápido.
        </p>
        <Button
          size="sm"
          className="mt-2 h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white"
          onClick={promptInstall}
          data-testid="button-pwa-install"
        >
          <Download className="w-3.5 h-3.5 mr-1.5" />
          Instalar agora
        </Button>
      </div>

      <button
        onClick={dismissBanner}
        className="w-7 h-7 flex items-center justify-center rounded-full bg-blue-100 hover:bg-blue-200 text-blue-600 transition-colors shrink-0"
        aria-label="Dispensar"
        data-testid="button-dismiss-install-banner"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
