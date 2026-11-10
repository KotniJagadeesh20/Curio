import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LoadingState({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground" role="status">
      <Loader2 className="h-5 w-5 animate-spin" />
      <span>{label}</span>
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : "Something went wrong";
  return (
    <div className="flex flex-col items-center gap-3 py-24 text-center" role="alert">
      <p className="text-muted-foreground">{message}</p>
      {onRetry && <Button variant="outline" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <div className="py-16 text-center text-muted-foreground">{message}</div>;
}
