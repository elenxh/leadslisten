import Link from "next/link";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/app/status-badge";
import { LeitungAvatar } from "@/components/app/leitung-avatar";
import { SelectCheckbox } from "@/components/app/select-checkbox";
import { SchulMarkierung } from "@/components/app/schul-markierung";
import { AmpelBadge } from "@/components/app/ampel";
import type { SchuleMitLeitung } from "@/lib/types";

/**
 * Kompakte Listen-/Tabellen-Ansicht der Schulen.
 * Spalten (Desktop): Schulname · Stadt · Schulart · Status · Kontakt · Telefon.
 * Mobile: Schulname + Status, Stadt/Schulart + Ampel klein darunter.
 */
export function SchulTable({
  schulen,
  showLeitung,
  selectable,
  selectedIds,
  onToggle,
  isAdmin,
  editableStandortIds,
  legendeByStandort,
}: {
  schulen: SchuleMitLeitung[];
  showLeitung?: boolean;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onToggle?: (id: string, checked: boolean) => void;
  isAdmin?: boolean;
  editableStandortIds?: Set<string>;
  legendeByStandort?: Record<string, Record<string, string>>;
}) {
  const canMark = (standortId: string | null) =>
    !!isAdmin || (!!standortId && !!editableStandortIds?.has(standortId));
  return (
    <Card className="overflow-hidden p-0">
      {/* Kopfzeile – nur Desktop */}
      <div className="hidden border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground sm:flex sm:items-center sm:gap-3">
        {selectable && <span className="w-4 shrink-0" />}
        <span className="w-4 shrink-0" />
        <span className="min-w-0 flex-1">Schule</span>
        <span className="w-24 shrink-0">Stadt</span>
        <span className="w-32 shrink-0">Schulart</span>
        <span className="w-40 shrink-0">Status</span>
        <span className="w-24 shrink-0">Kontakt</span>
        {showLeitung && <span className="w-8 shrink-0" />}
      </div>

      <div className="divide-y">
        {schulen.map((s) => {
          const selected = selectedIds?.has(s.id) ?? false;
          return (
            <Link
              key={s.id}
              href={`/schule/${s.id}`}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-muted/50",
                selected && "bg-primary/5",
              )}
            >
              {selectable && (
                <span
                  className="flex shrink-0 items-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  <SelectCheckbox
                    checked={selected}
                    onCheckedChange={(c) => onToggle?.(s.id, c)}
                    stopOnClick
                    label={`${s.name} auswählen`}
                  />
                </span>
              )}

              {/* Markierung */}
              <span
                className="flex shrink-0 items-center"
                onClick={(e) => e.stopPropagation()}
              >
                <SchulMarkierung
                  schuleId={s.id}
                  farbe={s.markierung_farbe}
                  editable={canMark(s.standort_id)}
                  legende={legendeByStandort?.[s.standort_id ?? ""]}
                />
              </span>

              {/* Schule (+ Stadt/Schulart/Ampel klein auf Mobile) */}
              <div className="min-w-0 flex-1">
                <div className="font-semibold leading-snug break-words">
                  {s.name}
                </div>
                <div className="mt-0.5 flex items-center gap-2 sm:hidden">
                  <span className="truncate text-xs text-muted-foreground">
                    {[s.stadt, s.schulart].filter(Boolean).join(" · ") || "—"}
                  </span>
                  <AmpelBadge
                    erstkontakt={s.erstkontakt_am}
                    wiedervorlage={s.wiedervorlage_am}
                    letzterAnruf={s.letzter_anruf_am}
                  />
                </div>
              </div>

              {/* Stadt – Desktop */}
              <span className="hidden w-24 shrink-0 truncate text-muted-foreground sm:block">
                {s.stadt ?? "—"}
              </span>

              {/* Schulart – Desktop */}
              <span className="hidden w-32 shrink-0 truncate text-muted-foreground sm:block">
                {s.schulart ?? "—"}
              </span>

              {/* Status */}
              <span className="w-auto shrink-0 sm:w-40">
                <StatusBadge status={s.status} />
              </span>

              {/* Kontakt-Ampel – Desktop */}
              <span className="hidden w-24 shrink-0 sm:block">
                <AmpelBadge
                  erstkontakt={s.erstkontakt_am}
                  wiedervorlage={s.wiedervorlage_am}
                  letzterAnruf={s.letzter_anruf_am}
                />
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
