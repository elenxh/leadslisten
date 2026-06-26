import { cn } from "@/lib/utils";
import {
  AMPEL_DOT,
  AMPEL_LEGENDE,
  ampelInfo,
  ampelLabel,
} from "@/lib/ampel";

/**
 * Tage-Ampel: farbiger Punkt + "vor X Tagen", basierend ausschließlich auf
 * dem Referenzdatum (wiedervorlage_am, sonst erstkontakt_am).
 */
export function AmpelBadge({
  erstkontakt,
  wiedervorlage,
  letzterAnruf,
  showText = true,
  className,
}: {
  erstkontakt: string | null;
  wiedervorlage: string | null;
  letzterAnruf?: string | null;
  showText?: boolean;
  className?: string;
}) {
  const { stufe, tage } = ampelInfo(erstkontakt, wiedervorlage, letzterAnruf);
  const label = ampelLabel(tage);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs text-muted-foreground",
        className,
      )}
      title={label}
    >
      <span
        className={cn(
          "size-2.5 shrink-0 rounded-full",
          stufe ? AMPEL_DOT[stufe] : "bg-muted-foreground/30",
        )}
      />
      {showText && label}
    </span>
  );
}

/**
 * Kompakte, immer sichtbare Mini-Legende der Ampel-Farben (2×2). Tage-Bereiche
 * stammen aus AMPEL_LEGENDE (lib/ampel.ts) – also automatisch korrekt, falls die
 * Schwellen geändert werden. Dezent, passend zur Höhe der KPI-Kacheln.
 */
export function AmpelMiniLegende({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 content-center gap-x-3 gap-y-1.5 rounded-lg border bg-card px-3 py-2 text-[11px] leading-tight text-muted-foreground",
        className,
      )}
      aria-label="Legende der Ampel-Farben"
    >
      {AMPEL_LEGENDE.map((a) => (
        <span key={a.stufe} className="flex items-center gap-1.5">
          <span
            className={cn("size-2 shrink-0 rounded-full", a.dot)}
            aria-hidden
          />
          <span className="whitespace-nowrap">
            {a.stufe === "rot" ? `${a.bereich} (offen)` : a.bereich}
          </span>
        </span>
      ))}
    </div>
  );
}
