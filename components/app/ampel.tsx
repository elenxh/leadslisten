import { cn } from "@/lib/utils";
import { AMPEL_DOT, ampelInfo, ampelLabel } from "@/lib/ampel";

/**
 * Tage-Ampel: farbiger Punkt + "vor X Tagen", basierend ausschließlich auf
 * dem Referenzdatum (wiedervorlage_am, sonst erstkontakt_am).
 */
export function AmpelBadge({
  erstkontakt,
  wiedervorlage,
  showText = true,
  className,
}: {
  erstkontakt: string | null;
  wiedervorlage: string | null;
  showText?: boolean;
  className?: string;
}) {
  const { stufe, tage } = ampelInfo(erstkontakt, wiedervorlage);
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
