import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { Leitung } from "@/lib/types";

type MiniLeitung = Pick<Leitung, "name" | "kuerzel" | "farbe"> | null;

function initials(l: NonNullable<MiniLeitung>): string {
  if (l.kuerzel?.trim()) return l.kuerzel.trim().slice(0, 3).toUpperCase();
  return l.name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function LeitungAvatar({
  leitung,
  className,
  title,
}: {
  leitung: MiniLeitung;
  className?: string;
  title?: boolean;
}) {
  if (!leitung) {
    return (
      <Avatar className={cn("size-7", className)}>
        <AvatarFallback className="bg-muted text-muted-foreground text-[10px]">
          —
        </AvatarFallback>
      </Avatar>
    );
  }

  const color = leitung.farbe || "#64748b";
  return (
    <Avatar
      className={cn("size-7", className)}
      title={title ? leitung.name : undefined}
    >
      <AvatarFallback
        className="text-[10px] font-semibold text-white"
        style={{ backgroundColor: color }}
      >
        {initials(leitung)}
      </AvatarFallback>
    </Avatar>
  );
}
