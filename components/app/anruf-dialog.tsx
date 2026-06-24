"use client";

import { useState } from "react";
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
import { createClient } from "@/lib/supabase/client";
import { ANRUF_TYP_LIST, STATUS_LIST } from "@/lib/status";
import type { AnrufTyp, SchulStatus } from "@/lib/types";

const KEEP = "__keep__";

export function AnrufDialog({
  schuleId,
  leitungId,
  currentStatus,
}: {
  schuleId: string;
  leitungId: string;
  currentStatus: SchulStatus;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [typ, setTyp] = useState<AnrufTyp>("telefonat");
  const [statusNeu, setStatusNeu] = useState<string>(KEEP);
  const [text, setText] = useState("");
  const [wvDatum, setWvDatum] = useState("");

  function reset() {
    setTyp("telefonat");
    setStatusNeu(KEEP);
    setText("");
    setWvDatum("");
  }

  async function save() {
    setSaving(true);
    const supabase = createClient();

    const newStatus =
      statusNeu === KEEP ? null : (statusNeu as SchulStatus);

    const { error: anrufError } = await supabase.from("anrufe").insert({
      schule_id: schuleId,
      leitung_id: leitungId,
      datum: new Date().toISOString(),
      typ,
      status_neu: newStatus,
      text: text.trim() || null,
    });

    if (anrufError) {
      toast.error("Anruf konnte nicht gespeichert werden", {
        description: anrufError.message,
      });
      setSaving(false);
      return;
    }

    // Apply follow-up changes to the school where chosen.
    const schulUpdate: Record<string, unknown> = {};
    if (newStatus) schulUpdate.status = newStatus;
    if (wvDatum) schulUpdate.naechster_anruf = wvDatum;

    if (Object.keys(schulUpdate).length > 0) {
      const { error: schulError } = await supabase
        .from("schulen")
        .update(schulUpdate)
        .eq("id", schuleId);
      if (schulError) {
        toast.error("Status/Wiedervorlage nicht aktualisiert", {
          description: schulError.message,
        });
      }
    }

    toast.success("Anruf protokolliert");
    setSaving(false);
    setOpen(false);
    reset();
    router.refresh();
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
        <DialogHeader>
          <DialogTitle>Anruf protokollieren</DialogTitle>
          <DialogDescription>
            Kontaktversuch festhalten und optional Status & Wiedervorlage setzen.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Art</Label>
            <Select value={typ} onValueChange={(v) => setTyp(v as AnrufTyp)}>
              <SelectTrigger>
                <SelectValue>
                  {(v: string) =>
                    ANRUF_TYP_LIST.find((t) => t.value === v)?.label ?? v
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {ANRUF_TYP_LIST.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Neuer Status (optional)</Label>
            <Select value={statusNeu} onValueChange={(v) => setStatusNeu((v as string) ?? KEEP)}>
              <SelectTrigger>
                <SelectValue>
                  {(v: string) =>
                    !v || v === KEEP
                      ? "Status beibehalten"
                      : STATUS_LIST.find((s) => s.value === v)?.label ?? v
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={KEEP}>Status beibehalten</SelectItem>
                {STATUS_LIST.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(statusNeu === "wv" ||
            (statusNeu === KEEP && currentStatus === "wv")) && (
            <div className="space-y-2">
              <Label htmlFor="wv">Wiedervorlage am</Label>
              <Input
                id="wv"
                type="date"
                value={wvDatum}
                onChange={(e) => setWvDatum(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="text">Notiz</Label>
            <Textarea
              id="text"
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Was wurde besprochen?"
            />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={save} disabled={saving} className="w-full sm:w-auto">
            {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
