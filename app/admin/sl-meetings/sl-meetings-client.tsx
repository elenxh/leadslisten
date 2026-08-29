"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
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
import { ChipMultiSelect } from "@/components/app/chip-multiselect";
import { formatDate, todayISO } from "@/lib/dates";
import {
  createSLMeeting,
  deleteSLMeeting,
  updateSLMeeting,
  type SLMeetingInput,
} from "@/app/stundennachweis/actions";
import type { Leitung, RessourcenLink } from "@/lib/types";
import type { MeetingMitTeilnehmer } from "./page";
import { RessourcenLinksAdmin } from "./ressourcen-links-admin";

export function SLMeetingsClient({
  sls,
  meetings,
  ressourcenLinks,
}: {
  sls: Pick<Leitung, "id" | "name" | "kuerzel" | "farbe">[];
  meetings: MeetingMitTeilnehmer[];
  ressourcenLinks: RessourcenLink[];
}) {
  const nameOf = (id: string) => sls.find((s) => s.id === id)?.name ?? "?";
  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-6">
      <RessourcenLinksAdmin links={ressourcenLinks} />

      <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">SL-Meetings</h1>
          <p className="text-sm text-muted-foreground">
            Einmal anlegen — zählt bei allen Teilnehmerinnen als Meeting-Zeit.
          </p>
        </div>
        <MeetingDialog sls={sls} />
      </div>

      <div className="space-y-2">
        {meetings.length === 0 && (
          <p className="text-sm text-muted-foreground">Noch keine SL-Meetings.</p>
        )}
        {meetings.map((m) => (
          <Card key={m.id}>
            <CardContent className="flex items-start justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="text-sm font-medium">{m.titel}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(m.datum)}
                  {m.uhrzeit ? ` · ${m.uhrzeit}` : ""} · {m.dauer_minuten} min
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {m.teilnehmer.length > 0 ? m.teilnehmer.map(nameOf).join(", ") : "keine Teilnehmerinnen"}
                </p>
                {m.call_link && (
                  <a
                    href={m.call_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-block truncate text-xs text-primary hover:underline"
                  >
                    {m.call_link}
                  </a>
                )}
                {m.notizen && (
                  <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{m.notizen}</p>
                )}
              </div>
              <span className="flex shrink-0 gap-1">
                <MeetingDialog sls={sls} meeting={m} />
                <LoeschButton onDelete={() => deleteSLMeeting(m.id)} />
              </span>
            </CardContent>
          </Card>
        ))}
      </div>
      </div>
    </main>
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
      className="size-8 text-muted-foreground hover:text-destructive"
      aria-label="Löschen"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await onDelete();
          if (!res.ok) { toast.error("Löschen fehlgeschlagen", { description: res.error }); return; }
          router.refresh();
        })
      }
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
    </Button>
  );
}

function MeetingDialog({
  sls,
  meeting,
}: {
  sls: Pick<Leitung, "id" | "name" | "kuerzel" | "farbe">[];
  meeting?: MeetingMitTeilnehmer;
}) {
  const router = useRouter();
  const isEdit = !!meeting;
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [datum, setDatum] = useState(meeting?.datum?.slice(0, 10) ?? todayISO());
  const [uhrzeit, setUhrzeit] = useState(meeting?.uhrzeit ?? "");
  const [dauer, setDauer] = useState(String(meeting?.dauer_minuten ?? ""));
  const [titel, setTitel] = useState(meeting?.titel ?? "");
  const [callLink, setCallLink] = useState(meeting?.call_link ?? "");
  const [notizen, setNotizen] = useState(meeting?.notizen ?? "");
  const [teilnehmer, setTeilnehmer] = useState<string[]>(meeting?.teilnehmer ?? []);

  function save() {
    const felder: SLMeetingInput = {
      datum,
      uhrzeit: uhrzeit || null,
      dauer_minuten: Number(dauer),
      titel,
      call_link: callLink || null,
      notizen: notizen || null,
      teilnehmer,
    };
    start(async () => {
      const res = meeting ? await updateSLMeeting(meeting.id, felder) : await createSLMeeting(felder);
      if (!res.ok) { toast.error("Speichern fehlgeschlagen", { description: res.error }); return; }
      toast.success("Gespeichert");
      setOpen(false);
      router.refresh();
    });
  }

  const valid = datum && Number(dauer) > 0 && titel.trim() && teilnehmer.length > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          isEdit ? (
            <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="Bearbeiten" />
          ) : (
            <Button type="button" size="sm" data-testid="meeting-add" />
          )
        }
      >
        {isEdit ? <Pencil className="size-4" /> : (<><Plus className="mr-1.5 size-4" />Neues Meeting</>)}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "SL-Meeting bearbeiten" : "Neues SL-Meeting"}</DialogTitle>
          <DialogDescription>Zählt bei allen Teilnehmerinnen als Meeting-Zeit im Stundennachweis.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Datum</Label>
              <Input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Uhrzeit</Label>
              <Input type="time" value={uhrzeit} onChange={(e) => setUhrzeit(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Dauer (Min.)</Label>
              <Input type="number" min={1} value={dauer} onChange={(e) => setDauer(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Titel</Label>
            <Input value={titel} onChange={(e) => setTitel(e.target.value)} placeholder="z. B. SL-Runde" />
          </div>
          <div className="space-y-1.5">
            <Label>Link zum Call (optional)</Label>
            <Input
              type="url"
              value={callLink}
              onChange={(e) => setCallLink(e.target.value)}
              placeholder="https://…"
              data-testid="meeting-link"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Notizen (optional, auch nachträglich)</Label>
            <Textarea
              rows={2}
              value={notizen}
              onChange={(e) => setNotizen(e.target.value)}
              placeholder="Infos für die Teilnehmerinnen…"
              data-testid="meeting-notizen"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Teilnehmerinnen</Label>
            <ChipMultiSelect
              options={sls.map((s) => ({ id: s.id, label: s.name }))}
              value={teilnehmer}
              onChange={setTeilnehmer}
              emptyHint="Keine SLs vorhanden."
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={pending || !valid} data-testid="meeting-save">
            {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
