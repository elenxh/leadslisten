"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronDown,
  ChevronLeft,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
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
import { LeitungAvatar } from "@/components/app/leitung-avatar";
import { cn } from "@/lib/utils";
import { formatDate, todayISO } from "@/lib/dates";
import {
  createProtokoll,
  updateProtokoll,
  deleteProtokoll,
  type ProtokollInput,
} from "@/app/team/actions";
import type {
  Aufgabe,
  Gespraechsprotokoll,
  Leitung,
  ProtokollAmpel,
} from "@/lib/types";

const AMPEL_META: Record<ProtokollAmpel, { label: string; dot: string }> = {
  gruen: { label: "Grün", dot: "bg-emerald-500" },
  gelb: { label: "Gelb", dot: "bg-amber-400" },
  rot: { label: "Rot", dot: "bg-red-500" },
};

function AmpelDot({ ampel }: { ampel: ProtokollAmpel | null }) {
  return (
    <span
      className={cn(
        "inline-block size-3 shrink-0 rounded-full",
        ampel ? AMPEL_META[ampel].dot : "border border-muted-foreground/40 bg-transparent",
      )}
      title={ampel ? `Ampel: ${AMPEL_META[ampel].label}` : "Ampel: keine"}
      aria-label={ampel ? `Ampel ${AMPEL_META[ampel].label}` : "Ampel keine"}
    />
  );
}

export function ProtokolleClient({
  me,
  owner,
  protokolle,
  leitungen,
  aufgabenByProtokoll,
}: {
  me: Leitung;
  owner: Pick<Leitung, "id" | "name" | "kuerzel" | "farbe">;
  protokolle: Gespraechsprotokoll[];
  leitungen: Pick<Leitung, "id" | "name">[];
  aufgabenByProtokoll: Record<string, Aufgabe[]>;
}) {
  const [addingNew, setAddingNew] = useState(false);
  const meIsAdmin = me.rolle === "admin";

  return (
    <main className="mx-auto max-w-3xl px-4 py-6" data-testid="protokolle-root">
      {meIsAdmin && (
        <Link
          href="/team"
          className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Alle Standortleitungen
        </Link>
      )}

      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <LeitungAvatar leitung={owner} />
          <div>
            <h1 className="text-lg font-semibold leading-tight">{owner.name}</h1>
            <p className="text-xs text-muted-foreground">
              1:1-Gesprächsprotokolle
            </p>
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => setAddingNew(true)}
          disabled={addingNew}
          data-testid="neues-protokoll"
        >
          <Plus className="mr-1.5 size-4" />
          Neues Protokoll
        </Button>
      </div>

      <div className="space-y-3">
        {addingNew && (
          <ProtokollCard
            leitungId={owner.id}
            leitungen={leitungen}
            aufgaben={[]}
            initialOpen
            onClose={() => setAddingNew(false)}
          />
        )}

        {protokolle.length === 0 && !addingNew && (
          <p className="text-sm text-muted-foreground">
            Noch keine Protokolle. Lege mit „Neues Protokoll“ das erste an.
          </p>
        )}

        {protokolle.map((p) => (
          <ProtokollCard
            key={p.id}
            leitungId={owner.id}
            protokoll={p}
            leitungen={leitungen}
            aufgaben={aufgabenByProtokoll[p.id] ?? []}
          />
        ))}
      </div>
    </main>
  );
}

interface AufgabeForm {
  id?: string;
  was: string;
  zugewiesen_an: string;
  bis_wann: string;
  erledigt?: boolean;
}

interface FormState {
  datum: string;
  uhrzeit: string;
  thema: string;
  inhalt: string;
  ergebnis: string;
  aufgaben: AufgabeForm[];
  wiedervorlage_am: string;
  ampel: ProtokollAmpel | null;
  dauer: string;
}

function initialState(
  p: Gespraechsprotokoll | undefined,
  aufgaben: Aufgabe[],
): FormState {
  return {
    datum: p?.datum?.slice(0, 10) ?? todayISO(),
    uhrzeit: p?.uhrzeit ?? "",
    dauer: p?.dauer_minuten != null ? String(p.dauer_minuten) : "",
    thema: p?.thema ?? "",
    inhalt: p?.inhalt ?? "",
    ergebnis: p?.ergebnis ?? "",
    aufgaben: aufgaben.map((a) => ({
      id: a.id,
      was: a.was,
      zugewiesen_an: a.zugewiesen_an ?? "",
      bis_wann: a.bis_wann.slice(0, 10),
      erledigt: a.erledigt,
    })),
    wiedervorlage_am: p?.wiedervorlage_am?.slice(0, 10) ?? "",
    ampel: p?.ampel ?? null,
  };
}

function ProtokollCard({
  leitungId,
  protokoll,
  leitungen,
  aufgaben,
  initialOpen = false,
  onClose,
}: {
  leitungId: string;
  protokoll?: Gespraechsprotokoll;
  leitungen: Pick<Leitung, "id" | "name">[];
  aufgaben: Aufgabe[];
  initialOpen?: boolean;
  onClose?: () => void;
}) {
  const router = useRouter();
  const isNew = !protokoll;
  const [open, setOpen] = useState(initialOpen);
  const [form, setForm] = useState<FormState>(() => initialState(protokoll, aufgaben));
  const [pending, start] = useTransition();

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const dirty =
    JSON.stringify(form) !== JSON.stringify(initialState(protokoll, aufgaben));

  function addAufgabe() {
    set("aufgaben", [
      ...form.aufgaben,
      { was: "", zugewiesen_an: leitungId, bis_wann: "" },
    ]);
  }
  function setAufgabe(i: number, k: keyof AufgabeForm, v: string) {
    set(
      "aufgaben",
      form.aufgaben.map((a, idx) => (idx === i ? { ...a, [k]: v } : a)),
    );
  }
  function removeAufgabe(i: number) {
    set(
      "aufgaben",
      form.aufgaben.filter((_, idx) => idx !== i),
    );
  }

  function save() {
    const felder: ProtokollInput = {
      datum: form.datum,
      uhrzeit: form.uhrzeit,
      thema: form.thema,
      inhalt: form.inhalt,
      ergebnis: form.ergebnis,
      aufgaben: form.aufgaben.map((a) => ({
        id: a.id,
        was: a.was,
        zugewiesen_an: a.zugewiesen_an,
        bis_wann: a.bis_wann,
      })),
      wiedervorlage_am: form.wiedervorlage_am,
      ampel: form.ampel,
      dauer_minuten: form.dauer ? Number(form.dauer) : null,
    };
    start(async () => {
      const res = isNew
        ? await createProtokoll(leitungId, felder)
        : await updateProtokoll(protokoll!.id, felder);
      if (!res.ok) {
        toast.error("Speichern fehlgeschlagen", { description: res.error });
        return;
      }
      toast.success(isNew ? "Protokoll angelegt" : "Protokoll gespeichert");
      if (isNew) {
        onClose?.();
      } else {
        setOpen(false);
      }
      router.refresh();
    });
  }

  function loeschen() {
    start(async () => {
      const res = await deleteProtokoll(protokoll!.id);
      if (!res.ok) {
        toast.error("Löschen fehlgeschlagen", { description: res.error });
        return;
      }
      toast.success("Protokoll gelöscht");
      router.refresh();
    });
  }

  return (
    <Card data-testid="protokoll-card" data-open={open}>
      {/* Zugeklappt: Datum · Uhrzeit · Thema · Ampel */}
      {!isNew && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          data-testid="panel-toggle"
          className="flex w-full items-center gap-3 px-4 py-3 text-left"
        >
          <AmpelDot ampel={form.ampel} />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">
              {formatDate(protokoll!.datum)}
              {form.uhrzeit ? ` · ${form.uhrzeit}` : ""}
              {form.thema ? ` · ${form.thema}` : ""}
            </span>
          </span>
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
      )}

      {(open || isNew) && (
        <CardContent className={cn("space-y-4", isNew ? "pt-4" : "border-t pt-4")}>
          {isNew && (
            <p className="text-sm font-medium">Neues Protokoll</p>
          )}

          {/* Kopf */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Datum</Label>
              <Input
                type="date"
                value={form.datum}
                onChange={(e) => set("datum", e.target.value)}
                data-testid="f-datum"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Uhrzeit</Label>
              <Input
                type="time"
                value={form.uhrzeit}
                onChange={(e) => set("uhrzeit", e.target.value)}
                data-testid="f-uhrzeit"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Dauer (Min.) *</Label>
              <Input
                type="number"
                min={1}
                value={form.dauer}
                onChange={(e) => set("dauer", e.target.value)}
                placeholder="z. B. 30"
                data-testid="f-dauer"
              />
              <p className="text-xs text-muted-foreground">
                Zählt als Meeting-Zeit im Stundennachweis. Pflicht.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Thema / Anlass</Label>
            <Input
              value={form.thema}
              onChange={(e) => set("thema", e.target.value)}
              data-testid="f-thema"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Gesprächsinhalt / Notizen</Label>
            <Textarea
              rows={4}
              value={form.inhalt}
              onChange={(e) => set("inhalt", e.target.value)}
              data-testid="f-inhalt"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Ergebnis / Vereinbarungen</Label>
            <Textarea
              rows={3}
              value={form.ergebnis}
              onChange={(e) => set("ergebnis", e.target.value)}
              data-testid="f-ergebnis"
            />
          </div>

          {/* Nächste Schritte – Aufgaben (was / wer / bis wann). Zuweisbar,
              abhakbar, KEINE Vergütungszeit. */}
          <div className="space-y-2">
            <Label>Nächste Schritte – Aufgaben</Label>
            <p className="text-xs text-muted-foreground">
              Aufgaben pro Person mit Frist. Erscheinen bei der SL als „Meine
              Aufgaben“. Keine Vergütungszeit.
            </p>
            {form.aufgaben.length > 0 && (
              <div className="space-y-2">
                <div className="hidden grid-cols-[1fr_10rem_9rem_auto] gap-2 px-1 text-xs text-muted-foreground sm:grid">
                  <span>Was</span>
                  <span>Wer</span>
                  <span>Bis wann</span>
                  <span />
                </div>
                {form.aufgaben.map((a, i) => (
                  <div
                    key={a.id ?? `neu-${i}`}
                    className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_10rem_9rem_auto]"
                    data-testid="aufgabe-row"
                  >
                    <Input
                      placeholder="Was ist zu tun?"
                      value={a.was}
                      onChange={(e) => setAufgabe(i, "was", e.target.value)}
                      data-testid="aufgabe-was"
                    />
                    <Select
                      value={a.zugewiesen_an}
                      onValueChange={(v) => setAufgabe(i, "zugewiesen_an", v as string)}
                    >
                      <SelectTrigger data-testid="aufgabe-wer">
                        <SelectValue placeholder="Wer">
                          {(v: string) => leitungen.find((l) => l.id === v)?.name ?? "Wer"}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {leitungen.map((l) => (
                          <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="date"
                      value={a.bis_wann}
                      onChange={(e) => setAufgabe(i, "bis_wann", e.target.value)}
                      data-testid="aufgabe-bis"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeAufgabe(i)}
                      aria-label="Aufgabe entfernen"
                      data-testid="aufgabe-remove"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                    {a.erledigt && (
                      <p className="text-xs text-emerald-600 dark:text-emerald-400 sm:col-span-4">
                        ✓ erledigt
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addAufgabe}
              data-testid="aufgabe-add"
            >
              <Plus className="mr-1.5 size-4" />
              Aufgabe hinzufügen
            </Button>
          </div>

          {/* Fuß */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Nachfassen am</Label>
              <Input
                type="date"
                value={form.wiedervorlage_am}
                onChange={(e) => set("wiedervorlage_am", e.target.value)}
                data-testid="f-wiedervorlage"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Einschätzung Ampel</Label>
              <div className="flex flex-wrap gap-2" data-testid="ampel-group">
                <AmpelButton
                  active={form.ampel === null}
                  onClick={() => set("ampel", null)}
                  label="Keine"
                />
                {(["gruen", "gelb", "rot"] as ProtokollAmpel[]).map((a) => (
                  <AmpelButton
                    key={a}
                    active={form.ampel === a}
                    onClick={() => set("ampel", a)}
                    label={AMPEL_META[a].label}
                    dot={AMPEL_META[a].dot}
                    testid={`ampel-${a}`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Aktionen */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-2">
              <Button
                onClick={save}
                disabled={
                  pending ||
                  (!isNew && !dirty) ||
                  (isNew && !(Number(form.dauer) > 0))
                }
                size="sm"
                data-testid="protokoll-save"
              >
                {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
                Speichern
              </Button>
              {isNew ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onClose}
                  disabled={pending}
                >
                  Abbrechen
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setForm(initialState(protokoll, aufgaben));
                    setOpen(false);
                  }}
                  disabled={pending}
                >
                  Schließen
                </Button>
              )}
            </div>

            {!isNew && (
              <Dialog>
                <DialogTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
                      data-testid="protokoll-delete"
                    />
                  }
                >
                  <Trash2 className="mr-1.5 size-4" />
                  Löschen
                </DialogTrigger>
                <DialogContent className="sm:max-w-sm">
                  <DialogHeader>
                    <DialogTitle>Protokoll löschen</DialogTitle>
                    <DialogDescription>
                      Dieses Gesprächsprotokoll wirklich löschen? Das kann nicht
                      rückgängig gemacht werden.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter className="gap-2 sm:justify-between">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={loeschen}
                      disabled={pending}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      data-testid="protokoll-delete-confirm"
                    >
                      {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
                      Endgültig löschen
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function AmpelButton({
  active,
  onClick,
  label,
  dot,
  testid,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  dot?: string;
  testid?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-testid={testid}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-medium transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-input text-foreground/70 hover:bg-muted",
      )}
    >
      {dot && <span className={cn("size-2.5 rounded-full", dot)} />}
      {label}
    </button>
  );
}
