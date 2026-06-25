"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { MARKIERUNG_FARBEN, markierungMeta } from "@/lib/markierung";
import { updateMarkierung } from "@/app/standorte/actions";

/**
 * Kleiner Farbpunkt pro Schule. Für berechtigte Nutzer klickbar -> Mini-
 * Auswahl der 5 Farben + "keine". Speichert sofort. Liegt oft in einem Link
 * (Karte/Zeile) – Klicks werden daher gestoppt, damit nicht navigiert wird.
 */
export function SchulMarkierung({
  schuleId,
  farbe,
  editable,
  legende,
  className,
}: {
  schuleId: string;
  farbe: string | null;
  editable: boolean;
  legende?: Record<string, string>;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const meta = markierungMeta(farbe);

  const labelFor = (value: string, fallback: string) =>
    legende?.[value]?.trim() || fallback;

  // Nicht editierbar: nur anzeigen (Punkt, wenn gesetzt).
  if (!editable) {
    if (!meta) return null;
    return (
      <span
        className={cn("inline-block size-2.5 rounded-full", meta.dot, className)}
        title={labelFor(meta.value, meta.label)}
      />
    );
  }

  function choose(f: string | null) {
    startTransition(async () => {
      const res = await updateMarkierung(schuleId, f);
      if (!res.ok) {
        toast.error("Markierung fehlgeschlagen", { description: res.error });
        return;
      }
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            disabled={pending}
            aria-label="Schule markieren"
            title={meta ? labelFor(meta.value, meta.label) : "Markieren"}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            className={cn(
              "inline-flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors",
              meta
                ? cn(meta.dot, "border-transparent")
                : "border-dashed border-muted-foreground/50 hover:border-foreground",
              className,
            )}
          />
        }
      />
      <DropdownMenuContent align="start" className="w-44">
        {MARKIERUNG_FARBEN.map((m) => (
          <DropdownMenuItem key={m.value} onClick={() => choose(m.value)}>
            <span className={cn("mr-2 size-3 rounded-full", m.dot)} />
            <span className="truncate">{labelFor(m.value, m.label)}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem onClick={() => choose(null)}>
          <span className="mr-2 size-3 rounded-full border border-dashed" />
          Keine
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
