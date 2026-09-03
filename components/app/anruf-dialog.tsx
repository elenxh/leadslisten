"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PhoneCall } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { STATUS_LIST } from "@/lib/status";
import { ERGEBNIS_LIST } from "@/lib/anruf";
import { plusTageISO, todayISO } from "@/lib/dates";
import { protokolliereAnruf } from "@/app/standorte/actions";

const STATUS_UNVERAENDERT = "__unchanged__";

export function AnrufDialog({
  schuleId,
  leitungId,
}: {
  schuleId: string;
  leitungId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const [datum, setDatum] = useState(todayISO());
  const [ergebnis, setErgebnis] = useState<string>("");
  const [status, setStatus] = useState<string>(STATUS_UNVERAENDERT);
  const [wv, setWv] = useState("");
  const [notiz, setNotiz] = useState("");

  function reset() {
    setDatum(todayISO());
    setErgebnis("");
    setStatus(STATUS_UNVERAENDERT);
    setWv("");
    setNotiz("");
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!datum) {
      toast.error("Bitte ein Datum angeben.");
      return;
    }
    if (!ergebnis) {
      toast.error("Bitte ein Ergebnis wählen.");
      return;
    }
    startTransition(async () => {
      const res = await protokolliereAnruf({
        schuleId,
        leitungId,
        datum,
        ergebnis,
        status: status === STATUS_UNVERAENDERT ? null : status,
        wiedervorlage: wv || null,
        notiz: notiz.trim() || null,
      });
      if (!res.ok) {
        toast.error("Anruf konnte nicht gespeichert werden", {
          description: res.error,
        });
        return;
      }
      toast.success("Anruf protokolliert");
      // Felder frisch für den nächsten Eintrag – Dialog bleibt offen.
      reset();
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger render={<Button className="w-full sm:w-auto" />}>
        <PhoneCall className="mr-2 size-4" />
        Anruf protokollieren
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={save}>
          <DialogHeader>
            <DialogTitle>Anruf protokollieren</DialogTitle>
            <DialogDescription>
              Ergebnis festhalten – optional Status setzen und Nachfassen
              planen. Nach dem Speichern bleibt der Dialog für den nächsten
              Eintrag offen.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            {/* Ergebnis (Pflicht) */}
            <div className="space-y-2">
              <Label>Ergebnis *</Label>
              <div className="grid grid-cols-3 gap-2">
                {ERGEBNIS_LIST.map((e) => (
                  <button
                    key={e.value}
                    type="button"
                    onClick={() => setErgebnis(e.value)}
                    aria-pressed={ergebnis === e.value}
                    className={cn(
                      "rounded-lg border px-2 py-2 text-sm font-medium transition-colors",
                      ergebnis === e.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-input text-foreground/70 hover:bg-muted",
                    )}
                  >
                    {e.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="anruf-datum">Datum des Anrufs</Label>
                <Input
                  id="anruf-datum"
                  type="date"
                  value={datum}
                  onChange={(e) => setDatum(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Neuer Status (optional)</Label>
                <Select
                  value={status}
                  onValueChange={(v) =>
                    setStatus((v as string) ?? STATUS_UNVERAENDERT)
                  }
                >
                  <SelectTrigger>
                    <SelectValue>
                      {(v: string) =>
                        v === STATUS_UNVERAENDERT
                          ? "— unverändert —"
                          : STATUS_LIST.find((s) => s.value === v)?.label ?? v
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={STATUS_UNVERAENDERT}>
                      — unverändert —
                    </SelectItem>
                    {STATUS_LIST.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Wiedervorlage mit Schnellwahl */}
            <div className="space-y-2">
              <Label htmlFor="anruf-wv">Nachfassen (optional)</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  id="anruf-wv"
                  type="date"
                  value={wv}
                  onChange={(e) => setWv(e.target.value)}
                  className="w-auto"
                />
                {[
                  ["1 Woche", 7],
                  ["2 Wochen", 14],
                  ["4 Wochen", 28],
                ].map(([label, tage]) => (
                  <button
                    key={tage}
                    type="button"
                    onClick={() => setWv(plusTageISO(tage as number))}
                    className="rounded-md border border-input px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {label as string}
                  </button>
                ))}
                {wv && (
                  <button
                    type="button"
                    onClick={() => setWv("")}
                    className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-destructive"
                  >
                    löschen
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="anruf-notiz">Notiz (optional)</Label>
              <Textarea
                id="anruf-notiz"
                rows={3}
                value={notiz}
                onChange={(e) => setNotiz(e.target.value)}
                placeholder="Was wurde besprochen?"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Fertig
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Speichern
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
