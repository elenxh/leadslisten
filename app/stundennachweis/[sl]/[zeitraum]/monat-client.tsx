"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronLeft, ChevronRight, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

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
import {
  rundeCalls,
  stundenAusMinuten,
  WOCHENTAG_KURZ,
  type Auswertung,
  type OrgaEintrag,
  type StundenEintrag,
  type TagAuswertung,
  type WochenAuswertung,
} from "@/lib/abrechnung";
import {
  createArbeitsstunde,
  createOrgaZeit,
  deleteArbeitsstunde,
  deleteOrgaZeit,
  setAdminKommentar,
  setTagNotiz,
  updateArbeitsstunde,
  updateOrgaZeit,
} from "@/app/stundennachweis/actions";

const KAT_LABEL: Record<string, string> = {
  meeting_teamleitung: "Meeting mit Teamleitung",
  orga: "Orga",
  sl_meeting: "SL-Meeting",
};
const FARBE_CLASS: Record<string, string> = {
  rot: "bg-red-500",
  gelb: "bg-amber-400",
  gruen: "bg-emerald-500",
};

interface KommentarInfo {
  datum: string | null;
  kommentar: string | null;
  farbe: "rot" | "gelb" | "gruen" | null;
}

export function MonatClient({
  istAdmin,
  slId,
  slName,
  monatTitel,
  zeitraumStart,
  zeitraumLabel,
  prevKey,
  nextKey,
  wiedervorlagen,
  auswertung,
  tagNotizen,
  adminKommentare,
}: {
  istAdmin: boolean;
  slId: string;
  slName: string;
  monatTitel: string;
  zeitraumStart: string;
  zeitraumLabel: string;
  prevKey: string;
  nextKey: string;
  wiedervorlagen: string[];
  auswertung: Auswertung;
  tagNotizen: { datum: string; notiz: string | null }[];
  adminKommentare: KommentarInfo[];
}) {
  const notizMap = new Map(tagNotizen.map((t) => [t.datum, t.notiz]));
  const kommentarMap = new Map(
    adminKommentare.filter((k) => k.datum).map((k) => [k.datum as string, k]),
  );
  const seiteKommentar = adminKommentare.find((k) => !k.datum) ?? null;
  const wvSet = new Set(wiedervorlagen);
  const s = auswertung.summe;

  return (
    <div className="flex flex-col-reverse gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 space-y-5">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="shrink-0"
              aria-label="Voriger Monat"
              render={<Link href={`/stundennachweis/${slId}?zeitraum=${prevKey}`} scroll={false} />}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-xl font-semibold">{monatTitel}</h1>
              <p className="text-xs text-muted-foreground">
                {slName} · Abrechnungszeitraum {zeitraumLabel}
              </p>
            </div>
            <Button
              variant="outline"
              size="icon"
              className="shrink-0"
              aria-label="Nächster Monat"
              render={<Link href={`/stundennachweis/${slId}?zeitraum=${nextKey}`} scroll={false} />}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            <OrgaDialog leitungId={slId} />
            <StundenDialog leitungId={slId} />
          </div>

          {istAdmin && (
            <AdminKommentarFeld
              leitungId={slId}
              zeitraumStart={zeitraumStart}
              datum={null}
              initial={seiteKommentar}
              titel="Admin-Notiz zur Monatsseite (für SL unsichtbar)"
            />
          )}

          <div className="space-y-3">
            {auswertung.wochen.map((w) => (
              <WochenBlock
                key={w.woche.key}
                w={w}
                istAdmin={istAdmin}
                slId={slId}
                zeitraumStart={zeitraumStart}
                notizMap={notizMap}
                kommentarMap={kommentarMap}
              />
            ))}
          </div>

          <Card>
            <CardContent className="space-y-2 p-4 text-sm">
              <p className="font-medium">Zeitraum-Summe (26.–25.)</p>
              <Row label={`Calls (${s.callsCount})`} value={`${stundenAusMinuten(s.callMinuten)} h`} />
              <Row label={`Vor-Ort-Termine (${s.termineCount})`} value={`${stundenAusMinuten(s.terminMinuten)} h`} />
              <Row label="E-Mails" value={`${s.emailsCount}`} />
              {s.orgaNachKategorie.map((o) => (
                <Row key={o.kategorie} label={KAT_LABEL[o.kategorie] ?? o.kategorie} value={`${stundenAusMinuten(o.minuten)} h`} />
              ))}
              <div className="border-t pt-2">
                <Row label={<span className="font-semibold">Berechnet gesamt</span>} value={<span className="font-semibold">{stundenAusMinuten(s.berechneteMinuten)} h</span>} />
                <Row label={<span className="text-muted-foreground">Angegebene Stunden (SL)</span>} value={<span className="text-muted-foreground">{stundenAusMinuten(s.angegebeneMinuten)} h</span>} />
              </div>
              {s.mehrarbeitCalls > 0 && (
                <p className="rounded-md bg-amber-500/10 px-2 py-1 text-amber-700 dark:text-amber-300">
                  Mehrarbeit im Zeitraum: {rundeCalls(s.mehrarbeitCalls)} Calls über Soll
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <aside className="lg:sticky lg:top-16 lg:w-64 lg:shrink-0">
          <MiniKalender
            wochen={auswertung.wochen}
            wvSet={wvSet}
            zeitraumLabel={zeitraumLabel}
          />
        </aside>
    </div>
  );
}

const KAT_FARBE = {
  call: { label: "Calls", dot: "bg-emerald-500" },
  vor_ort: { label: "Vor-Ort-Termine", dot: "bg-blue-500" },
  meeting: { label: "Meetings", dot: "bg-purple-500" },
  wiedervorlage: { label: "Wiedervorlagen", dot: "bg-amber-500" },
} as const;
type KatKey = keyof typeof KAT_FARBE;

function MiniKalender({
  wochen,
  wvSet,
  zeitraumLabel,
}: {
  wochen: WochenAuswertung[];
  wvSet: Set<string>;
  zeitraumLabel: string;
}) {
  function kategorien(t: TagAuswertung): KatKey[] {
    const ks: KatKey[] = [];
    if (t.calls.length) ks.push("call");
    if (t.termine.length) ks.push("vor_ort");
    if (t.orga.some((o) => o.kategorie === "meeting_teamleitung" || o.kategorie === "sl_meeting")) ks.push("meeting");
    if (wvSet.has(t.datumISO)) ks.push("wiedervorlage");
    return ks;
  }
  function jump(d: string) {
    const el = document.getElementById(`tag-${d}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <div className="rounded-lg border bg-card p-3" data-testid="mini-kalender">
      <p className="text-sm font-medium">Kalender</p>
      <p className="mb-2 text-[11px] text-muted-foreground">{zeitraumLabel}</p>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium text-muted-foreground">
        {WOCHENTAG_KURZ.map((w) => (
          <div key={w}>{w}</div>
        ))}
      </div>
      <div className="mt-1 space-y-1">
        {wochen.map((w) => (
          <div key={w.woche.key} className="grid grid-cols-7 gap-1">
            {w.tage.map((t) => {
              const ks = kategorien(t);
              const [, m2, d2] = t.datumISO.split("-");
              return (
                <button
                  key={t.datumISO}
                  type="button"
                  onClick={() => jump(t.datumISO)}
                  data-testid="mini-tag"
                  title={`${d2}.${m2}.`}
                  className={cn(
                    "flex aspect-square flex-col items-center justify-center gap-0.5 rounded text-[11px] leading-none transition-colors hover:bg-muted",
                    t.imZeitraum ? "text-foreground" : "text-muted-foreground/40",
                    ks.length > 0 && "font-semibold",
                  )}
                >
                  <span>{Number(d2)}</span>
                  <span className="flex h-1 items-center gap-0.5">
                    {ks.map((k) => (
                      <span key={k} className={cn("size-1 rounded-full", KAT_FARBE[k].dot)} />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground" data-testid="mini-legende">
        {(Object.keys(KAT_FARBE) as KatKey[]).map((k) => (
          <span key={k} className="inline-flex items-center gap-1">
            <span className={cn("size-2 rounded-full", KAT_FARBE[k].dot)} />
            {KAT_FARBE[k].label}
          </span>
        ))}
      </div>
    </div>
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

function WochenBlock({
  w,
  istAdmin,
  slId,
  zeitraumStart,
  notizMap,
  kommentarMap,
}: {
  w: WochenAuswertung;
  istAdmin: boolean;
  slId: string;
  zeitraumStart: string;
  notizMap: Map<string, string | null>;
  kommentarMap: Map<string, KommentarInfo>;
}) {
  const [open, setOpen] = useState(true);
  const hatMehrarbeit = w.mehrarbeitCalls > 0;

  return (
    <Card data-testid="wochen-block">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">KW {w.woche.label}</span>
          <span className="block text-xs text-muted-foreground">
            {w.calls.length} Calls · {w.termine.length} Termine · E-Mails: {w.emails.length} ·{" "}
            {w.sollCalls == null ? "kein Vertragsmodell" : (<>Soll {rundeCalls(w.istCallAequivalent)}/{rundeCalls(w.sollCalls)} {w.erfuellt ? "✓" : "✗"}</>)}
            {" "}· ber. {stundenAusMinuten(w.berechneteMinuten)} h · ang. {stundenAusMinuten(w.angegebeneMinuten)} h
          </span>
        </span>
        {hatMehrarbeit && (
          <span className="rounded-md bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-200" data-testid="mehrarbeit-badge">
            Mehrarbeit {rundeCalls(w.mehrarbeitCalls)}
          </span>
        )}
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <CardContent className="border-t p-0">
          <div className="divide-y">
            {w.tage.map((t) => (
              <TagZeile
                key={t.datumISO}
                t={t}
                istAdmin={istAdmin}
                slId={slId}
                zeitraumStart={zeitraumStart}
                notiz={notizMap.get(t.datumISO) ?? null}
                kommentar={kommentarMap.get(t.datumISO) ?? null}
              />
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function TagZeile({
  t,
  istAdmin,
  slId,
  zeitraumStart,
  notiz,
  kommentar,
}: {
  t: TagAuswertung;
  istAdmin: boolean;
  slId: string;
  zeitraumStart: string;
  notiz: string | null;
  kommentar: KommentarInfo | null;
}) {
  const [, d2, d3] = t.datumISO.split("-");
  const leer = t.calls.length + t.termine.length + t.emails.length + t.orga.length + t.stunden.length === 0;
  return (
    <div id={`tag-${t.datumISO}`} className={cn("flex scroll-mt-20 gap-3 px-4 py-2", !t.imZeitraum && "opacity-60")}>
      <div className="w-14 shrink-0 pt-0.5 text-xs">
        <div className="font-medium">{WOCHENTAG_KURZ[t.wochentag - 1]}</div>
        <div className="text-muted-foreground">{d3}.{d2}.</div>
      </div>
      <div className="min-w-0 flex-1 space-y-1 text-sm">
        {leer && <p className="text-xs text-muted-foreground">—</p>}
        {t.calls.map((c) => (
          <p key={c.id} className="truncate">
            <span className="text-emerald-600 dark:text-emerald-400">● Call</span> {c.schuleName ?? "—"}
            {c.notiz ? <span className="text-muted-foreground"> · {c.notiz}</span> : null}
          </p>
        ))}
        {t.termine.map((tm) => (
          <p key={tm.id} className="truncate">
            <span className="text-blue-600 dark:text-blue-400">◆ Vor-Ort</span> {tm.schuleName ?? "—"}
            {tm.notiz ? <span className="text-muted-foreground"> · {tm.notiz}</span> : null}
          </p>
        ))}
        {t.emails.map((em) => (
          <p key={em.id} className="truncate">
            <span className="text-cyan-600 dark:text-cyan-400">✉ E-Mail</span> {em.schuleName ?? "—"}
            {em.notiz ? <span className="text-muted-foreground"> · {em.notiz}</span> : null}
          </p>
        ))}
        {t.orga.map((o) =>
          o.quelle === "sl_meeting" ? (
            <p key={o.id} className="truncate">
              <span className="text-indigo-600 dark:text-indigo-400">◇ SL-Meeting</span> {o.minuten} min
              {o.beschreibung ? <span className="text-muted-foreground"> · {o.beschreibung}</span> : null}
            </p>
          ) : o.quelle === "protokoll" ? (
            <p key={o.id} className="flex items-center justify-between gap-2">
              <span className="truncate">
                <span className="text-purple-600 dark:text-purple-400">■ Meeting</span>{" "}
                {o.dauerFehlt ? (
                  <span className="font-medium text-destructive">Dauer fehlt</span>
                ) : (
                  `${o.minuten} min`
                )}
                {o.beschreibung ? <span className="text-muted-foreground"> · {o.beschreibung}</span> : null}
                <span className="text-muted-foreground"> · aus Gesprächsprotokoll</span>
              </span>
              <Link href={`/team/${slId}`} className="shrink-0 text-xs text-primary hover:underline">
                öffnen
              </Link>
            </p>
          ) : (
            <p key={o.id} className="flex items-center justify-between gap-2">
              <span className="truncate">
                <span className="text-purple-600 dark:text-purple-400">■ {KAT_LABEL[o.kategorie] ?? o.kategorie}</span> {o.minuten} min
                {o.beschreibung ? <span className="text-muted-foreground"> · {o.beschreibung}</span> : null}
              </span>
              <span className="flex shrink-0 gap-1">
                <OrgaDialog leitungId={slId} eintrag={o} />
                <LoeschButton onDelete={() => deleteOrgaZeit(o.id)} />
              </span>
            </p>
          ),
        )}
        {t.stunden.map((st) => (
          <p key={st.id} className="flex items-center justify-between gap-2">
            <span className="truncate">
              <span className="text-muted-foreground">▲ Angegeben</span> {stundenAusMinuten(st.minuten)} h
              {st.notiz ? <span className="text-muted-foreground"> · {st.notiz}</span> : null}
            </span>
            <span className="flex shrink-0 gap-1">
              <StundenDialog leitungId={slId} eintrag={st} />
              <LoeschButton onDelete={() => deleteArbeitsstunde(st.id)} />
            </span>
          </p>
        ))}

        <TagNotizFeld leitungId={slId} datum={t.datumISO} initial={notiz} />
        {istAdmin && (
          <AdminKommentarFeld
            leitungId={slId}
            zeitraumStart={zeitraumStart}
            datum={t.datumISO}
            initial={kommentar}
            titel="Admin (unsichtbar für SL)"
            kompakt
          />
        )}
      </div>
    </div>
  );
}

function TagNotizFeld({ leitungId, datum, initial }: { leitungId: string; datum: string; initial: string | null }) {
  const router = useRouter();
  const [val, setVal] = useState(initial ?? "");
  const [pending, start] = useTransition();
  const dirty = val !== (initial ?? "");

  function save() {
    if (!dirty) return;
    start(async () => {
      const res = await setTagNotiz({ leitungId, datum, notiz: val.trim() || null });
      if (!res.ok) { toast.error("Notiz nicht gespeichert", { description: res.error }); return; }
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2 pt-0.5">
      <Input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={save}
        placeholder="Notiz…"
        className="h-7 text-xs"
        data-testid="tag-notiz"
      />
      {pending && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
    </div>
  );
}

function AdminKommentarFeld({
  leitungId,
  zeitraumStart,
  datum,
  initial,
  titel,
  kompakt,
}: {
  leitungId: string;
  zeitraumStart: string;
  datum: string | null;
  initial: KommentarInfo | null;
  titel: string;
  kompakt?: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState(initial?.kommentar ?? "");
  const [farbe, setFarbe] = useState<"rot" | "gelb" | "gruen" | null>(initial?.farbe ?? null);
  const [pending, start] = useTransition();

  function save(nextFarbe: "rot" | "gelb" | "gruen" | null = farbe, nextText: string = text) {
    start(async () => {
      const res = await setAdminKommentar({
        leitungId,
        zeitraumStart,
        datum,
        kommentar: nextText.trim() || null,
        farbe: nextFarbe,
      });
      if (!res.ok) { toast.error("Kommentar nicht gespeichert", { description: res.error }); return; }
      router.refresh();
    });
  }

  return (
    <div className={cn("rounded-md border border-dashed border-amber-500/40 bg-amber-500/5 p-2", kompakt ? "" : "space-y-1")} data-testid="admin-kommentar">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium text-amber-700 dark:text-amber-300">{titel}</span>
        <span className="flex gap-1">
          {(["rot", "gelb", "gruen"] as const).map((f) => (
            <button
              key={f}
              type="button"
              aria-label={f}
              onClick={() => {
                const nf = farbe === f ? null : f;
                setFarbe(nf);
                save(nf, text);
              }}
              className={cn("size-4 rounded-full border", FARBE_CLASS[f], farbe === f ? "ring-2 ring-offset-1 ring-foreground/50" : "opacity-50")}
            />
          ))}
        </span>
        {pending && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
      </div>
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => save(farbe, text)}
        placeholder="Kommentar…"
        className="mt-1 h-7 text-xs"
        data-testid="admin-kommentar-input"
      />
    </div>
  );
}

function LoeschButton({ onDelete }: { onDelete: () => Promise<{ ok: boolean; error?: string }> }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button type="button" variant="ghost" size="icon" className="size-6 text-muted-foreground hover:text-destructive" aria-label="Löschen" disabled={pending}
      onClick={() => start(async () => { const res = await onDelete(); if (!res.ok) { toast.error("Löschen fehlgeschlagen", { description: res.error }); return; } router.refresh(); })}>
      {pending ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
    </Button>
  );
}

function OrgaDialog({ leitungId, eintrag }: { leitungId: string; eintrag?: OrgaEintrag }) {
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
      const felder = { datum, dauer_minuten: Number(minuten), kategorie: kategorie as "meeting_teamleitung" | "orga", beschreibung };
      const res = eintrag ? await updateOrgaZeit(eintrag.id, felder) : await createOrgaZeit(leitungId, felder);
      if (!res.ok) { toast.error("Speichern fehlgeschlagen", { description: res.error }); return; }
      toast.success("Gespeichert"); setOpen(false); router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={isEdit ? <Button type="button" variant="ghost" size="icon" className="size-6" aria-label="Bearbeiten" /> : <Button type="button" variant="outline" size="sm" data-testid="orga-add" />}>
        {isEdit ? <Pencil className="size-3" /> : (<><Plus className="mr-1.5 size-4" />Orga / Meeting</>)}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{isEdit ? "Orga bearbeiten" : "Orga / Meeting erfassen"}</DialogTitle><DialogDescription>Datum, Dauer, Kategorie, Beschreibung.</DialogDescription></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Datum</Label><Input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Dauer (Minuten)</Label><Input type="number" min={1} value={minuten} onChange={(e) => setMinuten(e.target.value)} /></div>
          </div>
          <div className="space-y-1.5">
            <Label>Kategorie</Label>
            <Select value={kategorie} onValueChange={(v) => setKategorie(v as string)}>
              <SelectTrigger className="w-full"><SelectValue>{(v: string) => KAT_LABEL[v] ?? "Kategorie"}</SelectValue></SelectTrigger>
              <SelectContent><SelectItem value="meeting_teamleitung">Meeting mit Teamleitung</SelectItem><SelectItem value="orga">Orga</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Beschreibung</Label><Textarea rows={2} value={beschreibung} onChange={(e) => setBeschreibung(e.target.value)} /></div>
        </div>
        <DialogFooter><Button onClick={save} disabled={pending || !datum || !(Number(minuten) > 0)}>{pending && <Loader2 className="mr-2 size-4 animate-spin" />}Speichern</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StundenDialog({ leitungId, eintrag }: { leitungId: string; eintrag?: StundenEintrag }) {
  const router = useRouter();
  const isEdit = !!eintrag;
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [datum, setDatum] = useState(eintrag?.datumISO ?? "");
  const [stunden, setStunden] = useState(eintrag ? String(eintrag.minuten / 60) : "");
  const [notiz, setNotiz] = useState(eintrag?.notiz ?? "");

  function save() {
    start(async () => {
      const felder = { datum, minuten: Math.round(Number(stunden) * 60), notiz };
      const res = eintrag ? await updateArbeitsstunde(eintrag.id, felder) : await createArbeitsstunde(leitungId, felder);
      if (!res.ok) { toast.error("Speichern fehlgeschlagen", { description: res.error }); return; }
      toast.success("Gespeichert"); setOpen(false); router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={isEdit ? <Button type="button" variant="ghost" size="icon" className="size-6" aria-label="Bearbeiten" /> : <Button type="button" variant="outline" size="sm" data-testid="stunden-add" />}>
        {isEdit ? <Pencil className="size-3" /> : (<><Plus className="mr-1.5 size-4" />Arbeitsstunden</>)}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{isEdit ? "Arbeitsstunden bearbeiten" : "Arbeitsstunden erfassen"}</DialogTitle><DialogDescription>Tatsächlich gearbeitete Stunden (Selbstangabe, ändert die Vergütung nicht).</DialogDescription></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Datum</Label><Input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Stunden</Label><Input type="number" min={0} step={0.25} value={stunden} onChange={(e) => setStunden(e.target.value)} /></div>
          </div>
          <div className="space-y-1.5"><Label>Notiz</Label><Textarea rows={2} value={notiz} onChange={(e) => setNotiz(e.target.value)} /></div>
        </div>
        <DialogFooter><Button onClick={save} disabled={pending || !datum || !(Number(stunden) > 0)}>{pending && <Loader2 className="mr-2 size-4 animate-spin" />}Speichern</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
