"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { todayISO } from "@/lib/dates";
import { formatDate } from "@/lib/dates";
import {
  createVertragsmodell,
  updateVertragsmodell,
  zuweiseVertrag,
  type VertragsmodellInput,
} from "@/app/stundennachweis/actions";
import type { Leitung, LeitungVertrag, Vertragsmodell } from "@/lib/types";

function minutenProCall(m: Vertragsmodell): string {
  return ((m.wochenstunden * 60) / m.calls_soll_pro_woche).toLocaleString("de-DE", {
    maximumFractionDigits: 1,
  });
}

export function VertragsmodelleClient({
  modelle,
  leitungen,
  vertraege,
}: {
  modelle: Vertragsmodell[];
  leitungen: Pick<Leitung, "id" | "name" | "kuerzel" | "farbe">[];
  vertraege: Pick<LeitungVertrag, "id" | "leitung_id" | "vertragsmodell_id" | "gilt_ab">[];
}) {
  const aktuellesModell = (leitungId: string): string | null => {
    const rows = vertraege
      .filter((v) => v.leitung_id === leitungId)
      .sort((a, b) => (a.gilt_ab < b.gilt_ab ? 1 : -1));
    const m = rows[0] && modelle.find((x) => x.id === rows[0].vertragsmodell_id);
    return m ? `${m.name} (ab ${formatDate(rows[0].gilt_ab)})` : null;
  };

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Vertragsmodelle</h1>
        <ModellDialog />
      </div>

      <div className="space-y-2">
        {modelle.map((m) => (
          <Card key={m.id}>
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <div>
                <p className="text-sm font-medium">
                  {m.name} {!m.aktiv && <span className="text-xs text-muted-foreground">(inaktiv)</span>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {m.wochenstunden} h/Woche · Soll {m.calls_soll_pro_woche} Calls ·{" "}
                  {minutenProCall(m)} min/Call
                </p>
              </div>
              <ModellDialog modell={m} />
            </CardContent>
          </Card>
        ))}
        {modelle.length === 0 && (
          <p className="text-sm text-muted-foreground">Noch keine Modelle.</p>
        )}
      </div>

      <div>
        <h2 className="mb-2 text-base font-semibold">Zuweisung je Standortleitung</h2>
        <div className="space-y-2">
          {leitungen.map((l) => (
            <Card key={l.id}>
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-sm font-medium">{l.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {aktuellesModell(l.id) ?? "kein Modell zugewiesen"}
                  </p>
                </div>
                <ZuweisenDialog leitungId={l.id} leitungName={l.name} modelle={modelle} />
              </CardContent>
            </Card>
          ))}
          {leitungen.length === 0 && (
            <p className="text-sm text-muted-foreground">Keine aktiven Standortleitungen.</p>
          )}
        </div>
      </div>
    </main>
  );
}

function ModellDialog({ modell }: { modell?: Vertragsmodell }) {
  const router = useRouter();
  const isEdit = !!modell;
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [name, setName] = useState(modell?.name ?? "");
  const [stunden, setStunden] = useState(String(modell?.wochenstunden ?? ""));
  const [calls, setCalls] = useState(String(modell?.calls_soll_pro_woche ?? ""));
  const [aktiv, setAktiv] = useState(modell?.aktiv ?? true);

  function save() {
    start(async () => {
      const felder: VertragsmodellInput = {
        name,
        wochenstunden: Number(stunden),
        calls_soll_pro_woche: Number(calls),
        aktiv,
      };
      const res = modell
        ? await updateVertragsmodell(modell.id, felder)
        : await createVertragsmodell(felder);
      if (!res.ok) {
        toast.error("Speichern fehlgeschlagen", { description: res.error });
        return;
      }
      toast.success("Gespeichert");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          isEdit ? (
            <Button type="button" variant="ghost" size="icon" aria-label="Bearbeiten" />
          ) : (
            <Button type="button" size="sm" data-testid="modell-add" />
          )
        }
      >
        {isEdit ? <Pencil className="size-4" /> : (<><Plus className="mr-1.5 size-4" />Modell</>)}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Modell bearbeiten" : "Neues Vertragsmodell"}</DialogTitle>
          <DialogDescription>Minuten/Call = Wochenstunden × 60 ÷ Calls-Soll.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Basic 3h" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Wochenstunden</Label>
              <Input type="number" min={0} step={0.5} value={stunden} onChange={(e) => setStunden(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Calls-Soll / Woche</Label>
              <Input type="number" min={0} step={0.5} value={calls} onChange={(e) => setCalls(e.target.value)} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={aktiv} onChange={(e) => setAktiv(e.target.checked)} />
            aktiv
          </label>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={pending || !name.trim() || !(Number(stunden) > 0) || !(Number(calls) > 0)}>
            {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ZuweisenDialog({
  leitungId,
  leitungName,
  modelle,
}: {
  leitungId: string;
  leitungName: string;
  modelle: Vertragsmodell[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const aktive = modelle.filter((m) => m.aktiv);
  const [modellId, setModellId] = useState<string>(aktive[0]?.id ?? "");
  const [giltAb, setGiltAb] = useState(todayISO());

  function save() {
    if (!modellId) return;
    start(async () => {
      const res = await zuweiseVertrag({ leitungId, vertragsmodellId: modellId, giltAb });
      if (!res.ok) {
        toast.error("Zuweisen fehlgeschlagen", { description: res.error });
        return;
      }
      toast.success("Zugewiesen");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="outline" size="sm" data-testid="zuweisen" />}>
        Zuweisen
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Modell zuweisen — {leitungName}</DialogTitle>
          <DialogDescription>
            Neue Zuweisung mit Gültig-ab. Ältere Zeiträume behalten ihr damaliges Modell (Historie).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>Modell</Label>
            <Select value={modellId} onValueChange={(v) => setModellId(v as string)}>
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(v: string) => aktive.find((m) => m.id === v)?.name ?? "Modell wählen"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {aktive.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Gültig ab</Label>
            <Input type="date" value={giltAb} onChange={(e) => setGiltAb(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={pending || !modellId || !giltAb}>
            {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Zuweisen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
