"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MapPin } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { todayISO } from "@/lib/dates";
import { protokolliereVorOrtTermin } from "@/app/standorte/actions";

export function VorOrtDialog({ schuleId }: { schuleId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [datum, setDatum] = useState(todayISO());
  const [notiz, setNotiz] = useState("");

  function save() {
    start(async () => {
      const res = await protokolliereVorOrtTermin({
        schuleId,
        datum,
        notiz: notiz.trim() || null,
      });
      if (!res.ok) {
        toast.error("Speichern fehlgeschlagen", { description: res.error });
        return;
      }
      toast.success("Vor-Ort-Termin gespeichert");
      setNotiz("");
      setDatum(todayISO());
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button type="button" variant="outline" size="sm" data-testid="vorort-add" />}
      >
        <MapPin className="mr-1.5 size-4" />
        Vor-Ort-Termin
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Vor-Ort-Termin protokollieren</DialogTitle>
          <DialogDescription>
            Zählt im Stundennachweis als Termin (60 Min + Soll-Gewicht), nicht als
            erfolgreicher Call.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>Datum</Label>
            <Input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Notiz (optional)</Label>
            <Textarea rows={3} value={notiz} onChange={(e) => setNotiz(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={pending || !datum}>
            {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
