import { Loader2 } from "lucide-react";

export function LoadingScreen({ message = "Carregando..." }: { message?: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground">
      <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
      <h3 className="text-xl font-display font-medium text-muted-foreground animate-pulse">
        {message}
      </h3>
    </div>
  );
}
