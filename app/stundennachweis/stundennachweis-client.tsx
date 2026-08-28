"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/dates";
import {
  rundeCalls,
  stundenAusMinuten,
  type Auswertung,
  type OrgaEintrag,
  type StundenEintrag,
  type WochenAuswertung,
  type Zeitraum,
} from "@/lib/abrechnung";
import type { Leitung } from "@/lib/types";
import {
  createArbeitsstunde,
  createOrgaZeit,
  deleteArbeitsstunde,
  deleteOrgaZeit,
  setzeMehrarbeitBestaetigung,
  updateArbeitsstunde,
  updateOrgaZeit,
} from "./actions";

const KAT_LABEL: Record<string, string> = {
  meeting_teamleitung: "Meeting mit Teamleitung",
  orga: "Orga",
};

export function StundennachweisClient({
  istAdmin,
  targetId,
  targetName,
  slListe,
  zeitraeume,
  selectedKey,
  auswertung,
  bestaetigtWochen,
}: {
  istAdmin: boolean;
  targetId: string;
  targetName: string;
  slListe: Pick<Leitung, "id" | "name" | "kuerzel" | "farbe">[];
  zeitraeume: Zeitraum[];
  selectedKey: string;
  auswertung: Auswertung;
  bestaetigtWochen: string[];
}) {
  const router = useRouter();
  const bestaetigt = new Set(bestaetigtWochen);

  function nav(next: { sl?: string; zeitraum?: string }) {
    const sl = next.sl ?? targetId;
    const z = next.zeitraum ?? selectedKey;
    router.push(`/stundennachweis?sl=${sl}&zeitraum=${z}`);
  }

  const s = auswertung.summe;

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Stundennachweis</h1>
          <p className="text-sm text-muted-foreground">{targetName}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {istAdmin && slListe.length > 0 && (
            <Select value={targetId} onValueChange={(v) => nav({ sl: v as string })}>
              <SelectTrigger className="w-44" data-testid="sl-select">
                <SelectValue>
                  {(v: string) => slListe.find((l) => l.id === v)?.name ?? "SL"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {slListe.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select
            value={selectedKey}
            onValueChange={(v) => nav({ zeitraum: v as string })}
          >
            <SelectTrigger className="w-48" data-testid="zeitraum-select">
              <SelectValue>
                {(v: string) =>
                  zeitraeume.find((z) => z.key === v)?.label ?? "Zeitraum"
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {zeitraeume.map((z) => (
                <SelectItem key={z.key} value={z.key}>
                  {z.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Erfassen */}
      <div className="flex flex-wrap gap-2">
        <OrgaDialog leitungId={targetId} />
        <StundenDialog leitungId={targetId} />
      </div>

      {/* Wochen */}
      <div className="space-y-3">
        {auswertung.wochen.map((w) => (
          <WochenPanel
            key={w.woche.key}
            w={w}
            istAdmin={istAdmin}
            targetId={targetId}
            bestaetigt={bestaetigt.has(w.woche.key)}
          />
        ))}
      </div>

      {/* Zeitraum-Summen */}
      <Card>
        <CardContent className="space-y-2 p-4 text-sm">
          <p className="font-medium">Zeitraum-Summe (26.–25.)</p>
          <Row label={`Calls (${s.callsCount})`} value={`${stundenAusMinuten(s.callMinuten)} h`} />
          <Row label={`Vor-Ort-Termine (${s.termineCount})`} value={`${stundenAusMinuten(s.terminMinuten)} h`} />
          {s.orgaNachKategorie.map((o) => (
            <Row
              key={o.kategorie}
              label={KAT_LABEL[o.kategorie] ?? o.kategorie}
              value={`${stundenAusMinuten(o.minuten)} h`}
            />
          ))}
          <div className="border-t pt-2">
            <Row
              label={<span className="font-semibold">Berechnet gesamt</span>}
              value={<span className="font-semibold">{stundenAusMinuten(s.berechneteMinuten)} h</span>}
            />
            <Row
              label={<span className="text-muted-foreground">Angegebene Stunden (SL)</span>}
              value={<span className="text-muted-foreground">{stundenAusMinuten(s.angegebeneMinuten)} h</span>}
            />
          </div>
          {s.mehrarbeitCalls > 0 && (
            <p className="rounded-md bg-amber-500/10 px-2 py-1 text-amber-700 dark:text-amber-300">
              Mehrarbeit im Zeitraum: {rundeCalls(s.mehrarbeitCalls)} Calls über Soll
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

function Row({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function WochenPanel({
  w,
  istAdmin,
  targetId,
  bestaetigt,
}: {
  w: WochenAuswertung;
  istAdmin: boolean;
  targetId: string;
  bestaetigt: boolean;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [pending, start] = useTransition();
  const hatMehrarbeit = w.mehrarbeitCalls > 0;

  function toggleBestaetigt() {
    start(async () => {
      const res = await setzeMehrarbeitBestaetigung({
        leitungId: targetId,
        wocheStart: w.woche.key,
        bestaetigt: !bestaetigt,
      });
      if (!res.ok) {
        toast.error("Fehlgeschlagen", { description: res.error });
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card data-testid="wochen-panel">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">KW {w.woche.label}</span>
          <span className="block text-xs text-muted-foreground">
            {w.calls.length} Calls · {w.termine.length} Termine ·{" "}
            {w.sollCalls == null ? (
              "kein Vertragsmodell"
            ) : (
              <>
                Soll {rundeCalls(w.istCallAequivalent)}/{rundeCalls(w.sollCalls)}{" "}
                {w.erfuellt ? "✓" : "✗"}
              </>
            )}{" "}
            · ber. {stundenAusMinuten(w.berechneteMinuten)} h · ang.{" "}
            {stundenAusMinuten(w.angegebeneMinuten)} h
          </span>
        </span>
        {hatMehrarbeit && (
          <span
            className={cn(
              "rounded-md px-2 py-0.5 text-xs font-medium",
              bestaetigt
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                : "bg-amber-500/20 text-amber-800 dark:text-amber-200",
            )}
            data-testid="mehrarbeit-badge"
          >
            Mehrarbeit {rundeCalls(w.mehrarbeitCalls)} · {bestaetigt ? "bestätigt" : "offen"}
          </span>
        )}
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <CardContent className="space-y-4 border-t pt-4 text-sm">
          {hatMehrarbeit && istAdmin && (
            <Button size="sm" variant="outline" onClick={toggleBestaetigt} disabled={pending}>
              {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
              {bestaetigt ? "Bestätigung zurücknehmen" : "Mehrarbeit bestätigen"}
            </Button>
          )}

          <Liste titel="Erfolgreiche Calls" leer="keine">
            {w.calls.map((c) => (
              <li key={c.id} className="flex justify-between gap-3">
                <span>{formatDate(c.datumISO)} · {c.schuleName ?? "—"}</span>
                <span className="text-muted-foreground truncate">{c.notiz ?? ""}</span>
              </li>
            ))}
          </Liste>

          <Liste titel="Vor-Ort-Termine" leer="keine">
            {w.termine.map((t) => (
              <li key={t.id} className="flex justify-between gap-3">
                <span>{formatDate(t.datumISO)} · {t.schuleName ?? "—"}</span>
                <span className="text-muted-foreground truncate">{t.notiz ?? ""}</span>
              </li>
            ))}
          </Liste>

          <Liste titel="Orga / Meetings" leer="keine">
            {w.orga.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-2">
                <span>
                  {formatDate(o.datumISO)} · {KAT_LABEL[o.kategorie] ?? o.kategorie} ·{" "}
                  {o.minuten} min{o.beschreibung ? ` · ${o.beschreibung}` : ""}
                </span>
                <span className="flex shrink-0 gap-1">
                  <OrgaDialog leitungId={targetId} eintrag={o} />
                  <LoeschButton onDelete={() => deleteOrgaZeit(o.id)} />
                </span>
              </li>
            ))}
          </Liste>

          <Liste titel="Angegebene Arbeitsstunden" leer="keine">
            {w.stunden.map((st) => (
              <li key={st.id} className="flex items-center justify-between gap-2">
                <span>
                  {formatDate(st.datumISO)} · {stundenAusMinuten(st.minuten)} h
                  {st.notiz ? ` · ${st.notiz}` : ""}
                </span>
                <span className="flex shrink-0 gap-1">
                  <StundenDialog leitungId={targetId} eintrag={st} />
                  <LoeschButton onDelete={() => deleteArbeitsstunde(st.id)} />
                </span>
              </li>
            ))}
          </Liste>
        </CardContent>
      )}
    </Card>
  );
}

function Liste({
  titel,
  leer,
  children,
}: {
  titel: string;
  leer: string;
  children: React.ReactNode;
}) {
  const arr = Array.isArray(children) ? children : [children];
  const empty = arr.flat().filter(Boolean).length === 0;
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted-foreground">{titel}</p>
      {empty ? (
        <p className="text-xs text-muted-foreground">{leer}</p>
      ) : (
        <ul className="space-y-1">{children}</ul>
      )}
    </div>
  );
}

function LoeschButton({ onDelete }: { onDelete: () => Promise<{ ok: boolean; error?: string }> }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-7 text-muted-foreground hover:text-destructive"
      aria-label="Löschen"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await onDelete();
          if (!res.ok) {
            toast.error("Löschen fehlgeschlagen", { description: res.error });
            return;
          }
          router.refresh();
        })
      }
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
    </Button>
  );
}

function OrgaDialog({
  leitungId,
  eintrag,
}: {
  leitungId: string;
  eintrag?: OrgaEintrag;
}) {
  const router = useRouter();
  const isEdit = !!eintrag;
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [datum, setDatum] = useState(eintrag?.datumISO ?? "");
  const [minuten, setMinuten] = useState(String(eintrag?.minuten ?? ""));
  const [kategorie, setKategorie] = useState<string>(eintrag?.kategorie ?? "orga");
  const [beschreibung, setBeschreibung] = useState(eintrag?.beschreibung ?? "");

  function save() {
    start(async () => {
      const felder = {
        datum,
        dauer_minuten: Number(minuten),
        kategorie: kategorie as "meeting_teamleitung" | "orga",
        beschreibung,
      };
      const res = eintrag
        ? await updateOrgaZeit(eintrag.id, felder)
        : await createOrgaZeit(leitungId, felder);
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
            <Button type="button" variant="ghost" size="icon" className="size-7" aria-label="Bearbeiten" />
          ) : (
            <Button type="button" variant="outline" size="sm" data-testid="orga-add" />
          )
        }
      >
        {isEdit ? <Pencil className="size-3.5" /> : (<><Plus className="mr-1.5 size-4" />Orga / Meeting</>)}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Orga bearbeiten" : "Orga / Meeting erfassen"}</DialogTitle>
          <DialogDescription>Datum, Dauer, Kategorie und optionale Beschreibung.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Datum</Label>
              <Input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Dauer (Minuten)</Label>
              <Input type="number" min={1} value={minuten} onChange={(e) => setMinuten(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Kategorie</Label>
            <Select value={kategorie} onValueChange={(v) => setKategorie(v as string)}>
              <SelectTrigger className="w-full">
                <SelectValue>{(v: string) => KAT_LABEL[v] ?? "Kategorie"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="meeting_teamleitung">Meeting mit Teamleitung</SelectItem>
                <SelectItem value="orga">Orga</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Beschreibung</Label>
            <Textarea rows={2} value={beschreibung} onChange={(e) => setBeschreibung(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={pending || !datum || !(Number(minuten) > 0)}>
            {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StundenDialog({
  leitungId,
  eintrag,
}: {
  leitungId: string;
  eintrag?: StundenEintrag;
}) {
  const router = useRouter();
  const isEdit = !!eintrag;
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [datum, setDatum] = useState(eintrag?.datumISO ?? "");
  const [stunden, setStunden] = useState(
    eintrag ? String(eintrag.minuten / 60) : "",
  );
  const [notiz, setNotiz] = useState(eintrag?.notiz ?? "");

  function save() {
    start(async () => {
      const felder = {
        datum,
        minuten: Math.round(Number(stunden) * 60),
        notiz,
      };
      const res = eintrag
        ? await updateArbeitsstunde(eintrag.id, felder)
        : await createArbeitsstunde(leitungId, felder);
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
            <Button type="button" variant="ghost" size="icon" className="size-7" aria-label="Bearbeiten" />
          ) : (
            <Button type="button" variant="outline" size="sm" data-testid="stunden-add" />
          )
        }
      >
        {isEdit ? <Pencil className="size-3.5" /> : (<><Plus className="mr-1.5 size-4" />Arbeitsstunden</>)}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Arbeitsstunden bearbeiten" : "Arbeitsstunden erfassen"}</DialogTitle>
          <DialogDescription>
            Tatsächlich gearbeitete Stunden (reine Selbstangabe, ändert die Vergütung nicht).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Datum</Label>
              <Input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Stunden</Label>
              <Input
                type="number"
                min={0}
                step={0.25}
                value={stunden}
                onChange={(e) => setStunden(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Notiz</Label>
            <Textarea rows={2} value={notiz} onChange={(e) => setNotiz(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={pending || !datum || !(Number(stunden) > 0)}>
            {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
