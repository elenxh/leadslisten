import Link from "next/link";
import { MapPin, Phone } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/app/status-badge";
import { LeitungAvatar } from "@/components/app/leitung-avatar";
import { SelectCheckbox } from "@/components/app/select-checkbox";
import { SchulMarkierung } from "@/components/app/schul-markierung";
import { AmpelBadge } from "@/components/app/ampel";
import { ringLabel } from "@/lib/berlin-ring";
import type { SchuleMitLeitung } from "@/lib/types";

export function SchulCard({
  schule,
  showLeitung,
  selectable,
  selected,
  onToggle,
  markEditable,
  legende,
  nameClass,
}: {
  schule: SchuleMitLeitung;
  showLeitung?: boolean;
  selectable?: boolean;
  selected?: boolean;
  onToggle?: (checked: boolean) => void;
  markEditable?: boolean;
  legende?: Record<string, string>;
  nameClass?: string;
}) {
  return (
    <div className="relative">
      {selectable && (
        <span
          className="absolute left-3 top-3 z-10"
          onClick={(e) => e.stopPropagation()}
        >
          <SelectCheckbox
            checked={!!selected}
            onCheckedChange={(c) => onToggle?.(c)}
            stopOnClick
            label={`${schule.name} auswählen`}
          />
        </span>
      )}
      <Link href={`/schule/${schule.id}`} className="block">
        <Card
          className={cn(
            "p-4 transition-colors hover:bg-muted/50",
            selectable && "pl-10",
            selected && "ring-2 ring-primary",
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3
                className={cn(
                  "truncate font-medium leading-tight",
                  nameClass,
                )}
              >
                {schule.name}
              </h3>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="size-3 shrink-0" />
                <span className="truncate">{schule.stadt || "—"}</span>
              </p>
            </div>
            {showLeitung && (
              <LeitungAvatar leitung={schule.leitung} title className="shrink-0" />
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <SchulMarkierung
              schuleId={schule.id}
              farbe={schule.markierung_farbe}
              editable={!!markEditable}
              legende={legende}
            />
            {/* Tage-Ampel = einzige Farbcodierung */}
            <AmpelBadge
              erstkontakt={schule.erstkontakt_am}
              wiedervorlage={schule.wiedervorlage_am}
              letzterAnruf={schule.letzter_anruf_am}
            />
            <StatusBadge status={schule.status} />
            {schule.schulart && (
              <Badge variant="secondary" className="font-normal">
                {schule.schulart}
              </Badge>
            )}
            {schule.ring != null && (
              <span className="text-xs text-muted-foreground">
                {ringLabel(schule.ring)}
              </span>
            )}
          </div>

          {schule.tel && (
            <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
              <Phone className="size-3 shrink-0" />
              {schule.tel}
            </p>
          )}
        </Card>
      </Link>
    </div>
  );
}
