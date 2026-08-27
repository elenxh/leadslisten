import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { statusMeta } from "@/lib/status";

export function StatusBadge({
  status,
  className,
}: {
  // string (nicht SchulStatus), damit auch alte Werte tolerant angezeigt werden.
  status: string;
  className?: string;
}) {
  const meta = statusMeta(status);
  return (
    <Badge
      variant="secondary"
      className={cn(
        "h-auto whitespace-nowrap border px-2.5 py-0.5 text-sm font-semibold",
        meta.badge,
        className,
      )}
    >
      {meta.label}
    </Badge>
  );
}
