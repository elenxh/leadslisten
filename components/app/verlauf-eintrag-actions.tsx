"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Trash2 } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { ERGEBNIS_LIST } from "@/lib/anruf";
import { updateAnruf, deleteAnruf } from "@/app/standorte/actions";
import type { AnrufMitLeitung } from "@/lib/types";

const KEIN_ERGEBNIS = "__none__";

export function VerlaufEintragActions({ anruf }: { anruf: AnrufMitLeitung }) {
  return (
    <span className="flex shrink-0 items-center gap-0.5">
      <BearbeitenDialog anruf={anruf} />
      <LoeschenDialog anruf={anruf} />
    </span>
  );
}

function BearbeitenDialog({ anruf }: { anruf: AnrufMitLeitung }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const [datum, setDatum] = useState(anruf.datum?.slice(0, 10) ?? "");
  const [ergebnis, setErgebnis] = useState<string>(anruf.ergebnis ?? KEIN_ERGEBNIS);
  const [text, setText] = useState(anruf.text ?? "");

  function reset() {
    setDatum(anruf.datum?.slice(0, 10) ?? "");
    setErgebnis(anruf.ergebnis ?? KEIN_ERGEBNIS);
    setText(anruf.text ?? "");
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const res = await updateAnruf(anruf.id, {
        text: text.trim() || null,
        datum: datum || null,
        ergebnis: ergebnis === KEIN_ERGEBNIS ? null : ergebnis,
      });
      if (!res.ok) {
        toast.error("Speichern fehlgeschlagen", { description: res.error });
        return;
      }
      toast.success("Eintrag aktualisiert");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) reset();
      }}
    >
      <DialogTrigger
        render={
          <button
            type="button"
            aria-label="Eintrag bearbeiten"
            title="Bearbeiten"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          />
        }
      >
        <Pencil className="size-3.5" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={save}>
          <DialogHeader>
            <DialogTitle>Verlaufseintrag bearbeiten</DialogTitle>
            <DialogDescription>
              Text, Datum und Ergebnis anpassen. Der Schul-Status wird hier nicht
              geändert.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <div className="space-y-2">
              <Label>Ergebnis</Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <button
                  type="button"
                  onClick={() => setErgebnis(KEIN_ERGEBNIS)}
                  aria-pressed={ergebnis === KEIN_ERGEBNIS}
                  className={cn(
                    "rounded-lg border px-2 py-2 text-sm font-medium transition-colors",
                    ergebnis === KEIN_ERGEBNIS
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-input text-foreground/70 hover:bg-muted",
                  )}
                >
                  Keins
                </button>
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
                    {e.kurz}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor={`edit-datum-${anruf.id}`}>Datum</Label>
              <Input
                id={`edit-datum-${anruf.id}`}
                type="date"
                value={datum}
                onChange={(e) => setDatum(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={`edit-text-${anruf.id}`}>Notiz</Label>
              <Textarea
                id={`edit-text-${anruf.id}`}
                rows={3}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
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

function LoeschenDialog({ anruf }: { anruf: AnrufMitLeitung }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  function loeschen() {
    start(async () => {
      const res = await deleteAnruf(anruf.id);
      if (!res.ok) {
        toast.error("Löschen fehlgeschlagen", { description: res.error });
        return;
      }
      toast.success("Eintrag gelöscht");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button
            type="button"
            aria-label="Eintrag löschen"
            title="Löschen"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive hover:text-destructive-foreground"
          />
        }
      >
        <Trash2 className="size-3.5" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Verlaufseintrag löschen</DialogTitle>
          <DialogDescription>
            Diesen Verlaufseintrag wirklich löschen? Das kann nicht rückgängig
            gemacht werden.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Abbrechen
          </Button>
          <Button
            type="button"
            onClick={loeschen}
            disabled={pending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Löschen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
