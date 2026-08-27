import { CalendarClock, PhoneCall, PhoneForwarded, PhoneMissed } from "lucide-react";

import { cn } from "@/lib/utils";
import { ergebnisMeta, type Ergebnis } from "@/lib/anruf";
import { wiedervorlageInfo } from "@/lib/wiedervorlage";

const ERGEBNIS_ICON: Record<Ergebnis, typeof PhoneCall> = {
  erreicht: PhoneCall,
  nicht_erreicht: PhoneMissed,
  rueckruf: PhoneForwarded,
};

/**
 * Marker des LETZTEN Anruf-Ergebnisses + Zähler der aufeinanderfolgenden
 * "nicht erreicht". Beispiel: "Zuletzt: nicht erreicht · 3× in Folge".
 * Der Status selbst ändert sich dadurch nicht.
 */
export function ErgebnisMarker({
  ergebnis,
  serie,
  compact = false,
  className,
}: {
  ergebnis: string | null | undefined;
  serie: number | null | undefined;
  compact?: boolean;
  className?: string;
}) {
  const meta = ergebnisMeta(ergebnis);
  if (!meta) return null;
  const Icon = ERGEBNIS_ICON[meta.value];
  const n = serie ?? 0;
  const zeigeSerie = meta.value === "nicht_erreicht" && n >= 2;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground",
        className,
      )}
      title={
        zeigeSerie
          ? `Zuletzt: ${meta.kurz} · ${n}× in Folge`
          : `Zuletzt: ${meta.kurz}`
      }
    >
      <Icon className="size-3.5 shrink-0" />
      {!compact && <span>Zuletzt: {meta.kurz}</span>}
      {zeigeSerie && (
        <span className="rounded-full bg-muted px-1.5 font-medium tabular-nums text-foreground/80">
          {n}×{compact ? "" : " in Folge"}
        </span>
      )}
    </span>
  );
}

/**
 * Wiedervorlage-Marker (schul-weit). "Wiedervorlage: 25.09." bzw. bei Nähe
 * "in 3 Tagen fällig" / "heute fällig" / "überfällig". Fällige werden betont.
 */
export function WiedervorlageMarker({
  wiedervorlage,
  className,
}: {
  wiedervorlage: string | null | undefined;
  className?: string;
}) {
  const info = wiedervorlageInfo(wiedervorlage);
  if (!info.datum) return null;
  const faellig = info.heuteFaellig;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap text-xs",
        faellig
          ? "font-medium text-amber-700 dark:text-amber-300"
          : "text-muted-foreground",
        className,
      )}
      title={info.label}
    >
      <CalendarClock className="size-3.5 shrink-0" />
      {info.label}
    </span>
  );
}
