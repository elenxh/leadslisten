"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ExternalLink,
  Loader2,
  Lock,
  Mail,
  MapPin,
  Phone,
  User,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { createClient } from "@/lib/supabase/client";
import { STATUS_LIST, anrufTypLabel } from "@/lib/status";
import { SCHULART_OPTIONS } from "@/lib/schulart";
import { updateSchulart, updateStatus } from "@/app/standorte/actions";
import { AmpelBadge } from "@/components/app/ampel";
import { ringLabel } from "@/lib/berlin-ring";
import { formatDate, formatDateTime } from "@/lib/dates";
import type {
  AnrufMitLeitung,
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
}: {
  schule: SchuleMitLeitung;
  anrufe: AnrufMitLeitung[];
  me: Leitung;
  canEdit: boolean;
  canEditSchulart: boolean;
  leitungen: Pick<Leitung, "id" | "name" | "kuerzel" | "farbe">[];
  standorte: Standort[];
}) {
  const router = useRouter();
  const admin = me.rolle === "admin";

  // Status: sofortiges Speichern via Server-Action (Standort-Berechtigung).
  const [statusVal, setStatusVal] = useState<SchulStatus>(schule.status);
  const [savingStatus, setSavingStatus] = useState(false);

  const [wv, setWv] = useState(schule.wiedervorlage_am?.slice(0, 10) ?? "");
  const [erstkontakt, setErstkontakt] = useState(
    schule.erstkontakt_am?.slice(0, 10) ?? "",
  );
  const [notiz, setNotiz] = useState(schule.akquise_notiz ?? "");
  const [zustaendig, setZustaendig] = useState(schule.zustaendig ?? "");
  const [standort, setStandort] = useState(schule.standort_id ?? "");
  const [saving, setSaving] = useState(false);

  async function changeStatus(v: SchulStatus) {
    const prev = statusVal;
    setStatusVal(v);
    setSavingStatus(true);
    const res = await updateStatus(schule.id, v);
    setSavingStatus(false);
    if (!res.ok) {
      setStatusVal(prev);
      toast.error("Status konnte nicht gespeichert werden", {
        description: res.error,
      });
      return;
    }
    toast.success("Status aktualisiert");
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

  const dirty =
    wv !== (schule.wiedervorlage_am?.slice(0, 10) ?? "") ||
    notiz !== (schule.akquise_notiz ?? "") ||
    (admin && erstkontakt !== (schule.erstkontakt_am?.slice(0, 10) ?? "")) ||
    (admin && zustaendig !== (schule.zustaendig ?? "")) ||
    (admin && standort !== (schule.standort_id ?? ""));

  async function save() {
    setSaving(true);
    const supabase = createClient();
    const update: Record<string, unknown> = {
      wiedervorlage_am: wv || null,
      akquise_notiz: notiz.trim() || null,
    };
    if (admin) {
      update.erstkontakt_am = erstkontakt || null;
      update.zustaendig = zustaendig || null;
      update.standort_id = standort || null;
    }

    const { error } = await supabase
      .from("schulen")
      .update(update)
      .eq("id", schule.id);

    setSaving(false);
    if (error) {
      toast.error("Speichern fehlgeschlagen", { description: error.message });
      return;
    }
    toast.success("Gespeichert");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-5">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" render={<Link href="/dashboard" />}>
          <ArrowLeft className="mr-1 size-4" />
          Zurück
        </Button>
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
              wiedervorlage={schule.wiedervorlage_am}
            />
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
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <InfoRow icon={User} label="Ansprechpartner">
            {[schule.ansprechpartner, schule.rolle_ap]
              .filter(Boolean)
              .join(" · ") || "—"}
          </InfoRow>
          <InfoRow icon={Phone} label="Telefon">
            {schule.tel ? (
              <a className="text-primary hover:underline" href={`tel:${schule.tel}`}>
                {schule.tel}
              </a>
            ) : (
              "—"
            )}
          </InfoRow>
          <InfoRow icon={Mail} label="E-Mail">
            {schule.mail ? (
              <a
                className="text-primary hover:underline"
                href={`mailto:${schule.mail}`}
              >
                {schule.mail}
              </a>
            ) : (
              "—"
            )}
          </InfoRow>
          <InfoRow icon={MapPin} label="Adresse">
            {[schule.adresse, schule.stadt, schule.bezirk]
              .filter(Boolean)
              .join(", ") || "—"}
          </InfoRow>
          {schule.homepage && (
            <InfoRow icon={ExternalLink} label="Homepage">
              <a
                className="text-primary hover:underline"
                href={
                  schule.homepage.startsWith("http")
                    ? schule.homepage
                    : `https://${schule.homepage}`
                }
                target="_blank"
                rel="noreferrer"
              >
                {schule.homepage}
              </a>
            </InfoRow>
          )}
          {schule.notiz_original && (
            <div className="sm:col-span-2">
              <p className="text-xs text-muted-foreground">Ursprungsnotiz</p>
              <p className="whitespace-pre-wrap">{schule.notiz_original}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Akquise bearbeiten */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Akquise</CardTitle>
          {canEdit && (
            <AnrufDialog
              schuleId={schule.id}
              leitungId={me.id}
              currentStatus={statusVal}
            />
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status – sofort speichern; nur Filter-Info, keine Farbe.
              Editierbar für Admin + zuständige Standort-Leitung. */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              Status
              {savingStatus && (
                <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
              )}
            </Label>
            {canEditSchulart ? (
              <Select
                value={statusVal}
                onValueChange={(v) => changeStatus(v as SchulStatus)}
                disabled={savingStatus}
              >
                <SelectTrigger className="w-full sm:max-w-xs">
                  <SelectValue>
                    {(v: string) =>
                      STATUS_LIST.find((s) => s.value === v)?.label ?? v
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {STATUS_LIST.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <StatusBadge status={statusVal} />
            )}
          </div>

          {/* Erstkontakt + Wiedervorlage. Erstkontakt ist fix (nur Admin
              änderbar); Wiedervorlage kann die Leitung setzen -> Ampel zählt
              ab dann neu. */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="erstkontakt">Erstkontakt am</Label>
              {admin ? (
                <Input
                  id="erstkontakt"
                  type="date"
                  value={erstkontakt}
                  onChange={(e) => setErstkontakt(e.target.value)}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {schule.erstkontakt_am
                    ? formatDate(schule.erstkontakt_am)
                    : "—"}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="wv-date">Wiedervorlage am</Label>
              <Input
                id="wv-date"
                type="date"
                value={wv}
                onChange={(e) => setWv(e.target.value)}
                disabled={!canEdit}
              />
            </div>
          </div>

          {/* Schulart – editierbar für Admin + zuständige Standort-Leitung;
              speichert sofort bei Auswahl. */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              Schulart
              {savingSchulart && (
                <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
              )}
            </Label>
            {canEditSchulart ? (
              <Select
                value={schulartVal}
                onValueChange={(v) => changeSchulart((v as string) ?? "")}
                disabled={savingSchulart}
              >
                <SelectTrigger className="w-full sm:max-w-xs">
                  <SelectValue placeholder="Schulart wählen">
                    {(v: string) => v || "Schulart wählen"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {schulartOptions.map((o) => (
                    <SelectItem key={o} value={o}>
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-muted-foreground">
                {schule.schulart ?? "—"}
              </p>
            )}
          </div>

          {admin && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Zuständige Leitung</Label>
                <Select value={zustaendig || "none"} onValueChange={(v) => setZustaendig(v && v !== "none" ? v : "")}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Nicht zugewiesen">
                      {(v: string) =>
                        v && v !== "none"
                          ? leitungen.find((l) => l.id === v)?.name ??
                            "Nicht zugewiesen"
                          : "Nicht zugewiesen"
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nicht zugewiesen</SelectItem>
                    {leitungen.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Standort</Label>
                <Select value={standort || "none"} onValueChange={(v) => setStandort(v && v !== "none" ? v : "")}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Kein Standort">
                      {(v: string) =>
                        v && v !== "none"
                          ? standorte.find((s) => s.id === v)?.name ??
                            "Kein Standort"
                          : "Kein Standort"
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Kein Standort</SelectItem>
                    {standorte.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="notiz">Akquise-Notiz</Label>
            <Textarea
              id="notiz"
              rows={4}
              value={notiz}
              onChange={(e) => setNotiz(e.target.value)}
              disabled={!canEdit}
              placeholder="Interne Notizen zur Akquise…"
            />
          </div>

          {canEdit && (
            <Button onClick={save} disabled={!dirty || saving}>
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
              Änderungen speichern
            </Button>
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
                        <span className="font-medium">{anrufTypLabel(a.typ)}</span>
                        {a.status_neu && (
                          <>
                            <span className="text-muted-foreground">→</span>
                            <StatusBadge status={a.status_neu} />
                          </>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(a.datum)}
                        </span>
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
