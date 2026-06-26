"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Palette } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { MARKIERUNG_FARBEN } from "@/lib/markierung";
import { AMPEL_LEGENDE } from "@/lib/ampel";
import { saveFarbLegende } from "@/app/standorte/actions";

/**
 * Legenden-Panel: pro Farbe eine eigene Bezeichnung – gilt für den aktuell
 * gewählten Standort. Bearbeitbar für Admin und betreuende Leitung.
 */
export function FarbLegendeDialog({
  standortId,
  standortName,
  legende,
  editable,
}: {
  standortId: string | null;
  standortName: string | null;
  legende: Record<string, string>;
  editable: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [werte, setWerte] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  function openChange(o: boolean) {
    setOpen(o);
    if (o) {
      // aktuelle Bezeichnungen übernehmen
      const init: Record<string, string> = {};
      for (const m of MARKIERUNG_FARBEN) init[m.value] = legende[m.value] ?? "";
      setWerte(init);
    }
  }

  function save() {
    if (!standortId) return;
    startTransition(async () => {
      const entries = MARKIERUNG_FARBEN.map((m) => ({
        farbe: m.value,
        bezeichnung: werte[m.value] ?? "",
      }));
      const res = await saveFarbLegende(standortId, entries);
      if (!res.ok) {
        toast.error("Legende fehlgeschlagen", { description: res.error });
        return;
      }
      toast.success("Legende gespeichert");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={openChange}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Palette className="size-4 sm:mr-1.5" />
        <span className="hidden sm:inline">Legende</span>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Legende</DialogTitle>
          <DialogDescription>
            Bedeutung der Ampel-Farben und der Schul-Markierungen.
          </DialogDescription>
        </DialogHeader>

        {/* Ampel: Tage seit letztem gültigen Kontakt (zentrale Logik). */}
        <div className="space-y-2 py-1">
          <p className="text-xs font-medium text-foreground">
            Ampel – Tage seit letztem Kontakt
          </p>
          <ul className="space-y-1.5">
            {AMPEL_LEGENDE.map((a) => (
              <li key={a.stufe} className="flex items-center gap-3 text-sm">
                <span
                  className={cn("size-3 shrink-0 rounded-full", a.dot)}
                  aria-hidden
                />
                <span className="w-24 shrink-0 font-medium">{a.bereich}</span>
                <span className="text-muted-foreground">{a.bedeutung}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Markierungen: pro Standort frei benannte Farben. */}
        <div className="space-y-2 border-t pt-3">
          <p className="text-xs font-medium text-foreground">
            Markierungen
            {standortName ? ` – „${standortName}"` : ""}
          </p>
          {!standortId && (
            <p className="text-xs text-muted-foreground">
              Wähle links einen konkreten Standort, um dessen Markierungs-Legende
              zu sehen und zu bearbeiten.
            </p>
          )}
        </div>

        {standortId && (
          <div className="space-y-2 py-1">
            {MARKIERUNG_FARBEN.map((m) => (
              <div key={m.value} className="flex items-center gap-3">
                <span
                  className={cn("size-4 shrink-0 rounded-full", m.dot)}
                  title={m.label}
                />
                <Input
                  value={werte[m.value] ?? ""}
                  onChange={(e) =>
                    setWerte((p) => ({ ...p, [m.value]: e.target.value }))
                  }
                  placeholder={`Bedeutung für ${m.label}…`}
                  disabled={!editable || pending}
                />
              </div>
            ))}
            {!editable && (
              <p className="text-xs text-muted-foreground">
                Nur betreuende Leitungen oder Admins können diese Legende
                bearbeiten.
              </p>
            )}
          </div>
        )}

        {standortId && editable && (
          <DialogFooter>
            <Button onClick={save} disabled={pending}>
              {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Speichern
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
