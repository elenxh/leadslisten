"use client";

import { useState, useTransition } from "react";
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
import { STATUS_LIST } from "@/lib/status";
import { todayISO } from "@/lib/dates";
import { protokolliereAnruf } from "@/app/standorte/actions";
import type { SchulStatus } from "@/lib/types";

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
  const [pending, startTransition] = useTransition();

  const [datum, setDatum] = useState(todayISO());
  const [status, setStatus] = useState<string>(currentStatus);
  const [wv, setWv] = useState("");
  const [notiz, setNotiz] = useState("");

  function reset() {
    setDatum(todayISO());
    setStatus(currentStatus);
    setWv("");
    setNotiz("");
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!datum) {
      toast.error("Bitte ein Datum angeben.");
      return;
    }
    startTransition(async () => {
      const res = await protokolliereAnruf({
        schuleId,
        leitungId,
        datum,
        status,
        wiedervorlage: wv || null,
        notiz: notiz.trim() || null,
      });
      if (!res.ok) {
        toast.error("Anruf konnte nicht gespeichert werden", {
          description: res.error,
        });
        return;
      }
      toast.success("Anruf protokolliert");
      setOpen(false);
      reset();
      router.refresh();
    });
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
        <form onSubmit={save}>
          <DialogHeader>
            <DialogTitle>Anruf protokollieren</DialogTitle>
            <DialogDescription>
              Kontaktversuch festhalten und Status / nächste Wiedervorlage
              setzen.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="anruf-datum">Datum des Anrufs</Label>
                <Input
                  id="anruf-datum"
                  type="date"
                  value={datum}
                  onChange={(e) => setDatum(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Ergebnis / Status</Label>
                <Select
                  value={status}
                  onValueChange={(v) => setStatus((v as string) ?? currentStatus)}
                >
                  <SelectTrigger>
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
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="anruf-wv">Nächste Wiedervorlage (optional)</Label>
              <Input
                id="anruf-wv"
                type="date"
                value={wv}
                onChange={(e) => setWv(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="anruf-notiz">Notiz</Label>
              <Textarea
                id="anruf-notiz"
                rows={3}
                value={notiz}
                onChange={(e) => setNotiz(e.target.value)}
                placeholder="Was wurde besprochen?"
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
