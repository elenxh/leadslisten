"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2, Square, CheckSquare, FileText } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/dates";
import type { AufgabeTyp, Leitung } from "@/lib/types";
import {
  createAufgabe,
  deleteAufgabe,
  setAufgabeErledigt,
  setKommentarSl,
  updateAufgabe,
} from "./actions";

export interface AufgabeView {
  id: string;
  was: string;
  bis_wann: string;
  typ: AufgabeTyp;
  quelle: "manuell" | "protokoll";
  zugewiesen_an: string | null;
  zugewiesenName: string | null;
  kommentar_admin: string | null;
  kommentar_sl: string | null;
  erledigt: boolean; // einzel: an der Aufgabe; gemeinsam: eigene Erledigung
  ueberfaellig: boolean;
  gemDone: number | null; // nur gemeinsam
  gemGesamt: number | null;
}

export function AufgabenClient({
  admin,
  sls,
  aufgaben,
}: {
  admin: boolean;
  sls: Pick<Leitung, "id" | "name">[];
  aufgaben: AufgabeView[];
}) {
  const [statusFilter, setStatusFilter] = useState<"offen" | "erledigt" | "alle">("offen");
  const [slFilter, setSlFilter] = useState<string>("alle");

  const gefiltert = useMemo(() => {
    return aufgaben.filter((a) => {
      if (statusFilter === "offen" && a.erledigt) return false;
      if (statusFilter === "erledigt" && !a.erledigt) return false;
      if (admin && slFilter !== "alle") {
        // Einzel: der SL zugewiesen; gemeinsam betrifft alle -> immer zeigen.
        if (a.typ === "einzel" && a.zugewiesen_an !== slFilter) return false;
      }
      return true;
    });
  }, [aufgaben, statusFilter, slFilter, admin]);

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-6">
      <div>
        <h1 className="text-xl font-semibold">Aufgaben</h1>
        <p className="text-sm text-muted-foreground">
          To-dos mit Frist — keine Vergütungszeit, reine Nachverfolgung.
        </p>
      </div>

      <NeueAufgabe admin={admin} sls={sls} />

      {/* Filter */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-md border">
          {(["offen", "erledigt", "alle"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={cn(
                "px-3 py-1.5 text-sm capitalize",
                statusFilter === s ? "bg-primary text-primary-foreground" : "hover:bg-muted",
              )}
              data-testid={`filter-${s}`}
            >
              {s}
            </button>
          ))}
        </div>
        {admin && sls.length > 0 && (
          <Select value={slFilter} onValueChange={(v) => setSlFilter(v as string)}>
            <SelectTrigger className="w-44" data-testid="filter-sl">
              <SelectValue>
                {(v: string) => (v === "alle" ? "Alle SLs" : sls.find((s) => s.id === v)?.name ?? "SL")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle SLs</SelectItem>
              {sls.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="space-y-2">
        {gefiltert.length === 0 && (
          <p className="text-sm text-muted-foreground">Keine Aufgaben.</p>
        )}
        {gefiltert.map((a) => (
          <AufgabeZeile key={a.id} a={a} admin={admin} />
        ))}
      </div>
    </main>
  );
}

function NeueAufgabe({
  admin,
  sls,
}: {
  admin: boolean;
  sls: Pick<Leitung, "id" | "name">[];
}) {
  const router = useRouter();
  const [offen, setOffen] = useState(false);
  const [pending, start] = useTransition();
  const [was, setWas] = useState("");
  const [bis, setBis] = useState("");
  const [typ, setTyp] = useState<AufgabeTyp>("einzel");
  const [wer, setWer] = useState<string>(admin ? "" : "self");
  const [kommentar, setKommentar] = useState("");

  function anlegen() {
    start(async () => {
      const res = await createAufgabe({
        was,
        bis_wann: bis,
        typ: admin ? typ : "einzel",
        zugewiesen_an: admin ? wer : undefined,
        kommentar_admin: admin ? kommentar : undefined,
      });
      if (!res.ok) {
        toast.error("Nicht angelegt", { description: res.error });
        return;
      }
      toast.success("Aufgabe angelegt");
      setWas(""); setBis(""); setKommentar(""); setWer(admin ? "" : "self");
      setOffen(false);
      router.refresh();
    });
  }

  if (!offen) {
    return (
      <Button size="sm" onClick={() => setOffen(true)} data-testid="aufgabe-neu">
        <Plus className="mr-1.5 size-4" />
        Neue Aufgabe
      </Button>
    );
  }

  const einzel = !admin || typ === "einzel";
  const valid = was.trim() && bis && (!admin || !einzel || wer);

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="space-y-1.5">
          <Label>Was ist zu tun?</Label>
          <Input value={was} onChange={(e) => setWas(e.target.value)} data-testid="neu-was" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Bis wann</Label>
            <Input type="date" value={bis} onChange={(e) => setBis(e.target.value)} data-testid="neu-bis" />
          </div>
          {admin && (
            <div className="space-y-1.5">
              <Label>Zuweisung</Label>
              <Select value={typ} onValueChange={(v) => setTyp(v as AufgabeTyp)}>
                <SelectTrigger data-testid="neu-typ">
                  <SelectValue>
                    {(v: string) => (v === "gemeinsam" ? "Gemeinsam (alle SLs)" : "Einzelne SL")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="einzel">Einzelne SL</SelectItem>
                  <SelectItem value="gemeinsam">Gemeinsam (alle SLs)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {admin && typ === "einzel" && (
            <div className="space-y-1.5">
              <Label>Wer</Label>
              <Select value={wer} onValueChange={(v) => setWer(v as string)}>
                <SelectTrigger data-testid="neu-wer">
                  <SelectValue placeholder="SL wählen">
                    {(v: string) => sls.find((s) => s.id === v)?.name ?? "SL wählen"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {sls.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        {admin && (
          <div className="space-y-1.5">
            <Label>Kommentar (optional)</Label>
            <Input value={kommentar} onChange={(e) => setKommentar(e.target.value)} />
          </div>
        )}
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={anlegen} disabled={pending || !valid} data-testid="neu-speichern">
            {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Anlegen
          </Button>
          <Button size="sm" variant="outline" onClick={() => setOffen(false)} disabled={pending}>
            Abbrechen
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AufgabeZeile({ a, admin }: { a: AufgabeView; admin: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const gemeinsamAdmin = a.typ === "gemeinsam" && admin;

  function toggle() {
    start(async () => {
      const res = await setAufgabeErledigt(a.id, !a.erledigt);
      if (!res.ok) { toast.error("Nicht gespeichert", { description: res.error }); return; }
      router.refresh();
    });
  }
  function loeschen() {
    start(async () => {
      const res = await deleteAufgabe(a.id);
      if (!res.ok) { toast.error("Löschen fehlgeschlagen", { description: res.error }); return; }
      router.refresh();
    });
  }

  return (
    <Card className={cn(a.erledigt && "opacity-60")} data-testid="aufgabe-zeile">
      <CardContent className="space-y-2 p-3">
        <div className="flex items-start gap-2">
          {gemeinsamAdmin ? (
            <span className="mt-0.5 shrink-0 text-muted-foreground" title="gemeinsam">
              <Square className="size-4" />
            </span>
          ) : (
            <button
              type="button"
              onClick={toggle}
              disabled={pending}
              aria-label={a.erledigt ? "Wieder öffnen" : "Als erledigt markieren"}
              className="mt-0.5 shrink-0 text-muted-foreground hover:text-primary"
              data-testid="zeile-check"
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : a.erledigt ? (
                <CheckSquare className="size-4 text-emerald-600" />
              ) : (
                <Square className="size-4" />
              )}
            </button>
          )}
          <div className="min-w-0 flex-1">
            <p className={cn("text-sm", a.erledigt && "line-through")}>{a.was}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
              <span className={cn(a.ueberfaellig ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground")}>
                {a.ueberfaellig ? "überfällig · " : "bis "}{formatDate(a.bis_wann)}
              </span>
              <span className="text-muted-foreground">
                · {a.typ === "gemeinsam" ? "gemeinsam" : a.zugewiesenName}
              </span>
              {a.typ === "gemeinsam" && a.gemGesamt != null && (
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {a.gemDone}/{a.gemGesamt} erledigt
                </span>
              )}
              {a.quelle === "protokoll" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  <FileText className="size-3" /> Protokoll
                </span>
              )}
            </p>
          </div>
          {admin && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
              aria-label="Löschen"
              disabled={pending}
              onClick={loeschen}
              data-testid="zeile-delete"
            >
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>

        {/* Kommentare: Admin-Zeile + SL-Zeile */}
        <div className="grid gap-2 pl-6 sm:grid-cols-2">
          <KommentarFeld
            label="Admin"
            initial={a.kommentar_admin}
            editable={admin}
            onSave={(text) => updateAufgabe(a.id, { kommentar_admin: text })}
          />
          <KommentarFeld
            label="SL"
            initial={a.kommentar_sl}
            editable={!admin && a.typ === "einzel"}
            onSave={(text) => setKommentarSl(a.id, text)}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function KommentarFeld({
  label,
  initial,
  editable,
  onSave,
}: {
  label: string;
  initial: string | null;
  editable: boolean;
  onSave: (text: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const router = useRouter();
  const [val, setVal] = useState(initial ?? "");
  const [pending, start] = useTransition();

  if (!editable) {
    if (!initial) return <div className="hidden sm:block" />;
    return (
      <p className="text-xs text-muted-foreground">
        <span className="font-medium">{label}:</span> {initial}
      </p>
    );
  }

  function save() {
    if (val === (initial ?? "")) return;
    start(async () => {
      const res = await onSave(val.trim());
      if (!res.ok) { toast.error("Kommentar nicht gespeichert", { description: res.error }); return; }
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
      <Input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={save}
        placeholder="Kommentar…"
        className="h-7 text-xs"
        data-testid={`kommentar-${label.toLowerCase()}`}
      />
      {pending && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
    </div>
  );
}
