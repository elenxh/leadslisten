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
      className={cn("border-transparent font-medium", meta.badge, className)}
    >
      {meta.label}
    </Badge>
  );
}
