import Link from "next/link";
import { CalendarClock } from "lucide-react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/app/status-badge";
import { LeitungAvatar } from "@/components/app/leitung-avatar";
import { formatDate, isDueToday, isOverdue } from "@/lib/dates";
import type { SchuleMitLeitung } from "@/lib/types";

/**
 * Kompakte Listen-/Tabellen-Ansicht der Schulen.
 * Spalten (Desktop): Schulname · Stadt · Status · Telefon.
 * Mobile: Schulname + Status, Stadt klein darunter.
 */
export function SchulTable({
  schulen,
  showLeitung,
}: {
  schulen: SchuleMitLeitung[];
  showLeitung?: boolean;
}) {
  return (
    <Card className="overflow-hidden p-0">
      {/* Kopfzeile – nur Desktop */}
      <div className="hidden border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground sm:flex sm:items-center sm:gap-3">
        <span className="min-w-0 flex-1">Schule</span>
        <span className="w-32 shrink-0">Stadt</span>
        <span className="w-32 shrink-0">Status</span>
        <span className="w-36 shrink-0">Telefon</span>
        {showLeitung && <span className="w-8 shrink-0" />}
      </div>

      <div className="divide-y">
        {schulen.map((s) => {
          const overdue = isOverdue(s.naechster_anruf);
          const dueToday = isDueToday(s.naechster_anruf);
          return (
            <Link
              key={s.id}
              href={`/schule/${s.id}`}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-muted/50",
                overdue && "border-l-4 border-rose-500",
                !overdue && dueToday && "border-l-4 border-orange-400",
              )}
            >
              {/* Schule (+ Stadt klein auf Mobile) */}
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{s.name}</div>
                <div className="mt-0.5 flex items-center gap-2 sm:hidden">
                  <span className="truncate text-xs text-muted-foreground">
                    {s.stadt ?? "—"}
                  </span>
                  {(overdue || dueToday) && s.naechster_anruf && (
                    <span
                      className={cn(
                        "flex items-center gap-0.5 text-xs",
                        overdue ? "text-rose-600" : "text-orange-600",
                      )}
                    >
                      <CalendarClock className="size-3" />
                      {formatDate(s.naechster_anruf)}
                    </span>
                  )}
                </div>
              </div>

              {/* Stadt – Desktop */}
              <span className="hidden w-32 shrink-0 truncate text-muted-foreground sm:block">
                {s.stadt ?? "—"}
              </span>

              {/* Status */}
              <span className="w-auto shrink-0 sm:w-32">
                <StatusBadge status={s.status} />
              </span>

              {/* Telefon – ab Desktop */}
              <span className="hidden w-36 shrink-0 truncate text-muted-foreground sm:block">
                {s.tel ?? "—"}
              </span>

              {/* Leitung – nur Admin */}
              {showLeitung && (
                <span className="hidden w-8 shrink-0 sm:block">
                  <LeitungAvatar leitung={s.leitung} title className="size-6" />
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </Card>
  );
}
