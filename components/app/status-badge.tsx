import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { statusMeta } from "@/lib/status";
import type { SchulStatus } from "@/lib/types";

export function StatusBadge({
  status,
  className,
}: {
  status: SchulStatus;
  className?: string;
}) {
  const meta = statusMeta(status);
  return (
    <Badge
      variant="secondary"
      className={cn(
        "h-auto whitespace-normal border px-2.5 py-0.5 text-sm font-semibold",
        meta.badge,
        className,
      )}
    >
      {meta.label}
    </Badge>
  );
}
