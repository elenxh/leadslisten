"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  GraduationCap,
  Loader2,
  Lock,
  Mail,
  MapPin,
  Phone,
  Trash2,
  User,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/app/status-badge";
import { LeitungAvatar } from "@/components/app/leitung-avatar";
import { AnrufDialog } from "@/components/app/anruf-dialog";
import { VorOrtDialog } from "@/components/app/vor-ort-dialog";
import { STATUS_LIST, anrufTypLabel } from "@/lib/status";
import { SCHULART_OPTIONS } from "@/lib/schulart";
import {
  deleteSchule,
  speichereAkquise,
  updateSchuleFelder,
  updateSchulart,
} from "@/app/standorte/actions";
import { AmpelBadge } from "@/components/app/ampel";
import { ErgebnisMarker, WiedervorlageMarker } from "@/components/app/anruf-marker";
import { VerlaufEintragActions } from "@/components/app/verlauf-eintrag-actions";
import { ergebnisMeta } from "@/lib/anruf";
import { KontakteSection } from "@/components/app/kontakte-section";
import { readSchulOrder } from "@/lib/schul-order";
import { ringLabel } from "@/lib/berlin-ring";
import { formatDate, formatDateTime, plusTageISO } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type {
  AnrufMitLeitung,
  Kontakt,
  Leitung,
  SchulStatus,
  SchuleMitLeitung,
  Standort,
} from "@/lib/types";

export function SchuleDetail({
  schule,
  anrufe,
  me,
  canEdit,
  canEditSchulart,
  leitungen,
  standorte,
  kontakte,
}: {
  schule: SchuleMitLeitung;
  anrufe: AnrufMitLeitung[];
  me: Leitung;
  canEdit: boolean;
  canEditSchulart: boolean;
  leitungen: Pick<Leitung, "id" | "name" | "kuerzel" | "farbe">[];
  standorte: Standort[];
  kontakte: Kontakt[];
}) {
  const router = useRouter();
  const admin = me.rolle === "admin";

  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function loeschen() {
    setDeleting(true);
    const res = await deleteSchule(schule.id);
    if (!res.ok) {
      setDeleting(false);
      toast.error("Löschen fehlgeschlagen", { description: res.error });
      return;
    }
    toast.success("Schule gelöscht");
    router.push("/dashboard");
  }

  // Vor/Zurück-Navigation gemäß der zuletzt im Dashboard gezeigten Reihenfolge.
  const [nav, setNav] = useState<{
    prev: string | null;
    next: string | null;
    pos: number;
    total: number;
  } | null>(null);
  useEffect(() => {
    const ids = readSchulOrder();
    const idx = ids.indexOf(schule.id);
    if (idx === -1) {
      setNav(null);
      return;
    }
    setNav({
      prev: idx > 0 ? ids[idx - 1] : null,
      next: idx < ids.length - 1 ? ids[idx + 1] : null,
      pos: idx + 1,
      total: ids.length,
    });
  }, [schule.id]);

  // Status wird beim gemeinsamen "Änderungen speichern" übernommen (nicht sofort).
  const [statusVal, setStatusVal] = useState<SchulStatus>(schule.status);
  const [callNotiz, setCallNotiz] = useState("");

  const [wv, setWv] = useState(schule.wiedervorlage_am?.slice(0, 10) ?? "");
  const [erstkontakt, setErstkontakt] = useState(
    schule.erstkontakt_am?.slice(0, 10) ?? "",
  );
  const [notiz, setNotiz] = useState(schule.akquise_notiz ?? "");
  const [zustaendig, setZustaendig] = useState(schule.zustaendig ?? "");
  const [standort, setStandort] = useState(schule.standort_id ?? "");
  const [zuordnungOffen, setZuordnungOffen] = useState(false);
  const [saving, startSave] = useTransition();

  // Editierbare Stamm-/Kontaktdaten (Berechtigung: Admin oder Standort-Leitung).
  const [kd, setKd] = useState({
    name: schule.name ?? "",
    bezirk: schule.bezirk ?? "",
    stadt: schule.stadt ?? "",
    ansprechpartner: schule.ansprechpartner ?? "",
    rolle_ap: schule.rolle_ap ?? "",
    tel: schule.tel ?? "",
    mail: schule.mail ?? "",
    homepage: schule.homepage ?? "",
    adresse: schule.adresse ?? "",
  });
  const [savingKd, setSavingKd] = useState(false);
  const kdDirty =
    kd.name !== (schule.name ?? "") ||
    kd.bezirk !== (schule.bezirk ?? "") ||
    kd.stadt !== (schule.stadt ?? "") ||
    kd.ansprechpartner !== (schule.ansprechpartner ?? "") ||
    kd.rolle_ap !== (schule.rolle_ap ?? "") ||
    kd.tel !== (schule.tel ?? "") ||
    kd.mail !== (schule.mail ?? "") ||
    kd.homepage !== (schule.homepage ?? "") ||
    kd.adresse !== (schule.adresse ?? "");

  const setKdField = (k: keyof typeof kd) => (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => setKd((p) => ({ ...p, [k]: e.target.value }));

  async function saveKontaktdaten() {
    if (!kd.name.trim()) {
      toast.error("Name ist erforderlich.");
      return;
    }
    setSavingKd(true);
    const res = await updateSchuleFelder(schule.id, {
      name: kd.name,
      bezirk: kd.bezirk,
      stadt: kd.stadt,
      ansprechpartner: kd.ansprechpartner,
      rolle_ap: kd.rolle_ap,
      tel: kd.tel,
      mail: kd.mail,
      homepage: kd.homepage,
      adresse: kd.adresse,
    });
    setSavingKd(false);
    if (!res.ok) {
      toast.error("Speichern fehlgeschlagen", { description: res.error });
      return;
    }
    toast.success("Stammdaten gespeichert");
    router.refresh();
  }

  // Ursprungsnotiz (notiz_original) – Import-Rohtext, frei editier-/leerbar.
  // Das Backup notiz_original_backup wird hier NICHT angezeigt/geändert.
  const [urspr, setUrspr] = useState(schule.notiz_original ?? "");
  const [savingUrspr, setSavingUrspr] = useState(false);
  const ursprDirty = urspr !== (schule.notiz_original ?? "");

  async function saveUrsprung() {
    setSavingUrspr(true);
    const res = await updateSchuleFelder(schule.id, { notiz_original: urspr });
    setSavingUrspr(false);
    if (!res.ok) {
      toast.error("Speichern fehlgeschlagen", { description: res.error });
      return;
    }
    toast.success("Ursprungsnotiz gespeichert");
    router.refresh();
  }


  // Schulart wird sofort bei Auswahl gespeichert (eigene Server-Action).
  const [schulartVal, setSchulartVal] = useState(schule.schulart ?? "");
  const [savingSchulart, setSavingSchulart] = useState(false);
  const schulartOptions = useMemo(() => {
    const opts = [...SCHULART_OPTIONS];
    if (schule.schulart && !opts.includes(schule.schulart)) {
      opts.unshift(schule.schulart);
    }
    return opts;
  }, [schule.schulart]);

  async function changeSchulart(v: string) {
    const prev = schulartVal;
    setSchulartVal(v);
    setSavingSchulart(true);
    const res = await updateSchulart(schule.id, v);
    setSavingSchulart(false);
    if (!res.ok) {
      setSchulartVal(prev);
      toast.error("Schulart konnte nicht gespeichert werden", {
        description: res.error,
      });
      return;
    }
    toast.success("Schulart aktualisiert");
    router.refresh();
  }

  // EIN Button speichert alles: Status (+ Auto-Call bei Kontakt-Status, auch
  // unverändert = Bestätigung), Wiedervorlage, Erstkontakt, Akquise-Notiz und
  // (nur Admin) Zuständig/Standort. Die große Notiz wird zum Call-Text.
  function save() {
    startSave(async () => {
      const res = await speichereAkquise(schule.id, {
        status: statusVal,
        callNotiz: callNotiz.trim() || null,
        wiedervorlage: wv || null,
        erstkontakt: erstkontakt || null,
        akquiseNotiz: notiz,
        zustaendig: admin ? zustaendig || null : undefined,
        standort: admin ? standort || null : undefined,
      });
      if (!res.ok) {
        toast.error("Speichern fehlgeschlagen", { description: res.error });
        return;
      }
      if (res.callErstellt) setCallNotiz("");
      toast.success(res.callErstellt ? "Gespeichert · Call erfasst" : "Gespeichert");
      router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" render={<Link href="/dashboard" />}>
            <ArrowLeft className="mr-1 size-4" />
            Zurück
          </Button>
          {nav && (
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                title="Vorherige Schule"
                aria-label="Vorherige Schule"
                disabled={!nav.prev}
                onClick={() => nav.prev && router.push(`/schule/${nav.prev}`)}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="px-1 text-xs tabular-nums text-muted-foreground">
                {nav.pos} / {nav.total}
              </span>
              <Button
                variant="outline"
                size="icon"
                title="Nächste Schule"
                aria-label="Nächste Schule"
                disabled={!nav.next}
                onClick={() => nav.next && router.push(`/schule/${nav.next}`)}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          )}
        </div>
        {!canEdit && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Lock className="size-3" /> Nur Lesezugriff
          </span>
        )}
      </div>

      {/* Kopf */}
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold leading-tight">{schule.name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              {schule.schulart && <span>{schule.schulart}</span>}
              {schule.ring != null && (
                <>
                  <span>·</span>
                  <span>{ringLabel(schule.ring)}</span>
                </>
              )}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <StatusBadge status={statusVal} />
            <AmpelBadge
              erstkontakt={schule.erstkontakt_am}
              letzterAnruf={schule.letzter_anruf_am}
            />
            <ErgebnisMarker
              ergebnis={schule.letztes_ergebnis}
              serie={schule.nicht_erreicht_serie}
            />
            <WiedervorlageMarker wiedervorlage={schule.wiedervorlage_am} />
            {schule.leitung && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <LeitungAvatar leitung={schule.leitung} className="size-5" />
                {schule.leitung.name}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Kontaktdaten */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Kontakt</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {canEditSchulart ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="kd-name">Name *</Label>
                  <Input id="kd-name" value={kd.name} onChange={setKdField("name")} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="kd-bezirk">Bezirk</Label>
                  <Input id="kd-bezirk" value={kd.bezirk} onChange={setKdField("bezirk")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="kd-stadt">Stadt</Label>
                  <Input id="kd-stadt" value={kd.stadt} onChange={setKdField("stadt")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="kd-ap">Ansprechpartner</Label>
                  <Input id="kd-ap" value={kd.ansprechpartner} onChange={setKdField("ansprechpartner")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="kd-rolle">Rolle / Funktion</Label>
                  <Input id="kd-rolle" value={kd.rolle_ap} onChange={setKdField("rolle_ap")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="kd-tel">Telefon</Label>
                  <Input id="kd-tel" value={kd.tel} onChange={setKdField("tel")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="kd-mail">E-Mail</Label>
                  <Input id="kd-mail" type="email" value={kd.mail} onChange={setKdField("mail")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="kd-home">Homepage</Label>
                  <Input id="kd-home" value={kd.homepage} onChange={setKdField("homepage")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="kd-adr">Adresse</Label>
                  <Input id="kd-adr" value={kd.adresse} onChange={setKdField("adresse")} />
                </div>
              </div>
              <Button onClick={saveKontaktdaten} disabled={!kdDirty || savingKd} size="sm">
                {savingKd && <Loader2 className="mr-2 size-4 animate-spin" />}
                Stammdaten speichern
              </Button>
            </>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              <InfoRow icon={User} label="Ansprechpartner">
                {[schule.ansprechpartner, schule.rolle_ap].filter(Boolean).join(" · ") || "—"}
              </InfoRow>
              <InfoRow icon={Phone} label="Telefon">
                {schule.tel ? (
                  <a className="text-primary hover:underline" href={`tel:${schule.tel}`}>{schule.tel}</a>
                ) : "—"}
              </InfoRow>
              <InfoRow icon={Mail} label="E-Mail">
                {schule.mail ? (
                  <a className="text-primary hover:underline" href={`mailto:${schule.mail}`}>{schule.mail}</a>
                ) : "—"}
              </InfoRow>
              <InfoRow icon={MapPin} label="Adresse">
                {[schule.adresse, schule.stadt, schule.bezirk].filter(Boolean).join(", ") || "—"}
              </InfoRow>
              {schule.homepage && (
                <InfoRow icon={ExternalLink} label="Homepage">
                  <a
                    className="text-primary hover:underline"
                    href={schule.homepage.startsWith("http") ? schule.homepage : `https://${schule.homepage}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {schule.homepage}
                  </a>
                </InfoRow>
              )}
            </div>
          )}

          {canEdit
            ? schule.notiz_original && (
                <div className="space-y-2">
                  <Label htmlFor="urspr-notiz">Ursprungsnotiz</Label>
                  <Textarea
                    id="urspr-notiz"
                    rows={4}
                    value={urspr}
                    onChange={(e) => setUrspr(e.target.value)}
                    placeholder="Import-Rohtext – Infos in die passenden Felder übernehmen und hier entfernen …"
                  />
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Button
                      onClick={saveUrsprung}
                      disabled={!ursprDirty || savingUrspr}
                      size="sm"
                    >
                      {savingUrspr && <Loader2 className="mr-2 size-4 animate-spin" />}
                      Ursprungsnotiz speichern
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Komplett leeren = löschen. Die Sicherheitskopie bleibt erhalten.
                    </p>
                  </div>
                </div>
              )
            : schule.notiz_original && (
                <div>
                  <p className="text-xs text-muted-foreground">Ursprungsnotiz</p>
                  <p className="whitespace-pre-wrap">{schule.notiz_original}</p>
                </div>
              )}

          <Separator />
          <KontakteSection
            schuleId={schule.id}
            kontakte={kontakte}
            editable={canEditSchulart}
          />
        </CardContent>
      </Card>

      {/* Akquise bearbeiten */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Akquise</CardTitle>
          {canEditSchulart && (
            <span className="flex items-center gap-2">
              <VorOrtDialog schuleId={schule.id} />
              <AnrufDialog schuleId={schule.id} leitungId={me.id} />
            </span>
          )}
        </CardHeader>
        <CardContent className="space-y-5">
          {canEditSchulart ? (
            <>
              {/* a) Status – wird erst beim Speichern übernommen. */}
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={statusVal}
                  onValueChange={(v) => setStatusVal(v as SchulStatus)}
                >
                  <SelectTrigger className="w-full sm:max-w-xs" data-testid="status-select">
                    <SelectValue>
                      {(v: string) => STATUS_LIST.find((s) => s.value === v)?.label ?? v}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_LIST.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* b) Großes Notizfeld -> Text des Auto-Call-Verlaufseintrags. */}
              <div className="space-y-1.5">
                <Label htmlFor="call-notiz">Notiz zum Kontakt</Label>
                <Textarea
                  id="call-notiz"
                  rows={5}
                  value={callNotiz}
                  onChange={(e) => setCallNotiz(e.target.value)}
                  placeholder="Was war beim Kontakt? Wird beim Speichern als Text des Call-Eintrags übernommen…"
                  data-testid="call-notiz"
                />
                <p className="text-xs text-muted-foreground">
                  Ein Kontakt-Status (nicht „Neu“/„Nicht erreichbar“) legt beim Speichern
                  automatisch einen erfolgreichen Call an — max. 1×/Tag; derselbe Status gilt
                  als Bestätigung.
                </p>
              </div>

              {/* c) Wiedervorlage – prominent mit Schnellwahl. */}
              <div className="space-y-2">
                <Label htmlFor="wv-date">Wiedervorlage am</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    id="wv-date"
                    type="date"
                    value={wv}
                    onChange={(e) => setWv(e.target.value)}
                    className="w-44"
                  />
                  <Button type="button" variant="outline" size="sm" onClick={() => setWv(plusTageISO(7))}>+1 Woche</Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setWv(plusTageISO(14))}>+2 Wochen</Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setWv(plusTageISO(28))}>+4 Wochen</Button>
                  {wv && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setWv("")}>Löschen</Button>
                  )}
                </div>
              </div>

              {/* d) weniger wichtige Felder unten. */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="erstkontakt" className="text-xs text-muted-foreground">Erstkontakt am</Label>
                  <Input id="erstkontakt" type="date" value={erstkontakt} onChange={(e) => setErstkontakt(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-2 text-xs text-muted-foreground">
                    Schulart
                    {savingSchulart && <Loader2 className="size-3 animate-spin" />}
                  </Label>
                  <Select value={schulartVal} onValueChange={(v) => changeSchulart((v as string) ?? "")} disabled={savingSchulart}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Schulart wählen">{(v: string) => v || "Schulart wählen"}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {schulartOptions.map((o) => (<SelectItem key={o} value={o}>{o}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="notiz" className="text-xs text-muted-foreground">Akquise-Notiz (Bestand)</Label>
                <Textarea
                  id="notiz"
                  rows={3}
                  value={notiz}
                  onChange={(e) => setNotiz(e.target.value)}
                  placeholder="Interne Notizen zur Akquise…"
                />
              </div>

              {/* e) Ein Button für alles. */}
              <Button onClick={save} disabled={saving} data-testid="akquise-save">
                {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
                Änderungen speichern
              </Button>

              {/* Zuordnung – nur Admin, eingeklappt ganz unten. */}
              {admin && (
                <div className="border-t pt-3">
                  <button
                    type="button"
                    onClick={() => setZuordnungOffen((o) => !o)}
                    className="flex w-full items-center justify-between text-sm font-medium text-muted-foreground hover:text-foreground"
                    data-testid="zuordnung-toggle"
                  >
                    Zuordnung
                    <ChevronDown className={cn("size-4 transition-transform", zuordnungOffen && "rotate-180")} />
                  </button>
                  {zuordnungOffen && (
                    <div className="mt-3 grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>Zuständige Leitung</Label>
                        <Select value={zustaendig || "none"} onValueChange={(v) => setZustaendig(v && v !== "none" ? v : "")}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Nicht zugewiesen">
                              {(v: string) => (v && v !== "none" ? leitungen.find((l) => l.id === v)?.name ?? "Nicht zugewiesen" : "Nicht zugewiesen")}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Nicht zugewiesen</SelectItem>
                            {leitungen.map((l) => (<SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Standort</Label>
                        <Select value={standort || "none"} onValueChange={(v) => setStandort(v && v !== "none" ? v : "")}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Kein Standort">
                              {(v: string) => (v && v !== "none" ? standorte.find((s) => s.id === v)?.name ?? "Kein Standort" : "Kein Standort")}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Kein Standort</SelectItem>
                            {standorte.map((s) => (<SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          Zuordnung wird beim „Änderungen speichern“ mit übernommen.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            /* Read-only für Nicht-Bearbeiter. */
            <div className="space-y-3 text-sm">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Status</p>
                <StatusBadge status={statusVal} />
              </div>
              <InfoRow icon={Clock3} label="Wiedervorlage am">{schule.wiedervorlage_am ? formatDate(schule.wiedervorlage_am) : "—"}</InfoRow>
              <InfoRow icon={Clock3} label="Erstkontakt am">{schule.erstkontakt_am ? formatDate(schule.erstkontakt_am) : "—"}</InfoRow>
              <InfoRow icon={GraduationCap} label="Schulart">{schule.schulart ?? "—"}</InfoRow>
              {schule.akquise_notiz && (
                <div>
                  <p className="text-xs text-muted-foreground">Akquise-Notiz</p>
                  <p className="whitespace-pre-wrap">{schule.akquise_notiz}</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Anruf-Historie */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Verlauf{" "}
            <span className="text-muted-foreground">({anrufe.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {anrufe.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Noch keine Kontaktversuche protokolliert.
            </p>
          ) : (
            <ol className="space-y-3">
              {anrufe.map((a, i) => (
                <li key={a.id}>
                  {i > 0 && <Separator className="mb-3" />}
                  <div className="flex items-start gap-3">
                    <LeitungAvatar leitung={a.leitung} className="mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                        {ergebnisMeta(a.ergebnis) ? (
                          <span className="font-medium">
                            {ergebnisMeta(a.ergebnis)!.label}
                          </span>
                        ) : !a.leitung ? (
                          // Historischer Eintrag aus akquise_notiz (kein Urheber).
                          <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                            Alt-Import
                          </span>
                        ) : (
                          <span className="font-medium">{anrufTypLabel(a.typ)}</span>
                        )}
                        {a.status_neu && (
                          <>
                            <span className="text-muted-foreground">→</span>
                            <StatusBadge status={a.status_neu} />
                          </>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(a.datum)}
                        </span>
                        {canEdit && (
                          <span className="ml-auto">
                            <VerlaufEintragActions anruf={a} />
                          </span>
                        )}
                      </div>
                      {a.text && (
                        <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                          {a.text}
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      {/* Löschen – nur Admin (Standortleitungen dürfen nicht löschen) */}
      {admin && (
        <div className="flex justify-end pt-2">
          <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <DialogTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
                />
              }
            >
              <Trash2 className="mr-1.5 size-4" />
              Schule löschen
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Schule wirklich löschen?</DialogTitle>
                <DialogDescription>
                  „{schule.name}“ wird endgültig gelöscht – inklusive Verlauf und
                  Ansprechpartner. Das kann nicht rückgängig gemacht werden.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  onClick={() => setDeleteOpen(false)}
                  disabled={deleting}
                >
                  Abbrechen
                </Button>
                <Button
                  onClick={loeschen}
                  disabled={deleting}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {deleting && <Loader2 className="mr-2 size-4 animate-spin" />}
                  Endgültig löschen
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="break-words">{children}</p>
      </div>
    </div>
  );
}
