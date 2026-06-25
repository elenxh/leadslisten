"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SCHULART_OPTIONS } from "@/lib/schulart";
import { STATUS_LIST } from "@/lib/status";
import { createSchule } from "@/app/standorte/actions";
import type { Leitung, Standort } from "@/lib/types";

const KEIN_STANDORT = "__none__";

export function NeueSchuleDialog({
  standorte,
  leitungen,
  isAdmin,
  meId,
  meName,
  defaultStandortId,
  bereich,
}: {
  standorte: Standort[];
  leitungen: Pick<Leitung, "id" | "name">[];
  isAdmin: boolean;
  meId: string;
  meName: string;
  defaultStandortId: string;
  bereich: "schule" | "traeger";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const traeger = bereich === "traeger";
  const nomenSg = traeger ? "Träger" : "Schule";

  const leer = () => ({
    name: "",
    schulart: traeger ? "Träger" : "",
    bezirk: "",
    homepage: "",
    adresse: "",
    ansprechpartner: "",
    rolle_ap: "",
    tel: "",
    mail: "",
    status: "Neu",
    erstkontakt_am: "",
    wiedervorlage_am: "",
    standortId: defaultStandortId || (standorte[0]?.id ?? ""),
    zustaendig: isAdmin ? "" : meId,
  });
  const [f, setF] = useState(leer);

  function openChange(o: boolean) {
    setOpen(o);
    if (o) setF(leer());
  }

  const set =
    (k: keyof ReturnType<typeof leer>) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setF((p) => ({ ...p, [k]: e.target.value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) {
      toast.error("Name ist erforderlich.");
      return;
    }
    if (!f.schulart.trim()) {
      toast.error("Schulart ist erforderlich.");
      return;
    }
    if (!isAdmin && !f.standortId) {
      toast.error("Bitte einen Standort wählen.");
      return;
    }
    startTransition(async () => {
      const res = await createSchule({
        name: f.name,
        schulart: f.schulart,
        bezirk: f.bezirk,
        homepage: f.homepage,
        adresse: f.adresse,
        ansprechpartner: f.ansprechpartner,
        rolle_ap: f.rolle_ap,
        tel: f.tel,
        mail: f.mail,
        status: f.status,
        erstkontakt_am: f.erstkontakt_am || null,
        wiedervorlage_am: f.wiedervorlage_am || null,
        standortId: f.standortId || null,
        zustaendig: f.zustaendig || null,
        typ: traeger ? "traeger" : "schule",
      });
      if (!res.ok) {
        toast.error("Anlegen fehlgeschlagen", { description: res.error });
        return;
      }
      toast.success(`${nomenSg} angelegt`);
      setOpen(false);
      router.push(`/schule/${res.id}`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={openChange}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="mr-1.5 size-4" />
        Neue {nomenSg}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Neue {nomenSg} anlegen</DialogTitle>
            <DialogDescription>
              Nur Name und Schulart sind Pflicht. Der Rest ist optional.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-3">
            <div className="space-y-1.5">
              <Label htmlFor="ns-name">Name *</Label>
              <Input id="ns-name" value={f.name} onChange={set("name")} required autoFocus />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ns-schulart">Schulart *</Label>
                {traeger ? (
                  <Input id="ns-schulart" value={f.schulart} onChange={set("schulart")} required />
                ) : (
                  <Select
                    value={f.schulart}
                    onValueChange={(v) => setF((p) => ({ ...p, schulart: (v as string) ?? "" }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Schulart wählen">
                        {(v: string) => v || "Schulart wählen"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {SCHULART_OPTIONS.map((o) => (
                        <SelectItem key={o} value={o}>
                          {o}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ns-bezirk">Bezirk / Stadt</Label>
                <Input id="ns-bezirk" value={f.bezirk} onChange={set("bezirk")} />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Standort</Label>
                <Select
                  value={f.standortId || KEIN_STANDORT}
                  onValueChange={(v) =>
                    setF((p) => ({
                      ...p,
                      standortId: v && v !== KEIN_STANDORT ? (v as string) : "",
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Standort wählen">
                      {(v: string) =>
                        v && v !== KEIN_STANDORT
                          ? standorte.find((s) => s.id === v)?.name ?? "Standort"
                          : "Kein Standort"
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {isAdmin && <SelectItem value={KEIN_STANDORT}>Kein Standort</SelectItem>}
                    {standorte.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Zuständige Leitung</Label>
                {isAdmin ? (
                  <Select
                    value={f.zustaendig || KEIN_STANDORT}
                    onValueChange={(v) =>
                      setF((p) => ({
                        ...p,
                        zustaendig: v && v !== KEIN_STANDORT ? (v as string) : "",
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Nicht zugewiesen">
                        {(v: string) =>
                          v && v !== KEIN_STANDORT
                            ? leitungen.find((l) => l.id === v)?.name ?? "Leitung"
                            : "Nicht zugewiesen"
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={KEIN_STANDORT}>Nicht zugewiesen</SelectItem>
                      {leitungen.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="flex h-9 items-center text-sm text-muted-foreground">
                    {meName}
                  </p>
                )}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ns-ap">Ansprechpartner</Label>
                <Input id="ns-ap" value={f.ansprechpartner} onChange={set("ansprechpartner")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ns-rolle">Rolle / Funktion</Label>
                <Input id="ns-rolle" value={f.rolle_ap} onChange={set("rolle_ap")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ns-tel">Telefon</Label>
                <Input id="ns-tel" value={f.tel} onChange={set("tel")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ns-mail">E-Mail</Label>
                <Input id="ns-mail" type="email" value={f.mail} onChange={set("mail")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ns-home">Homepage</Label>
                <Input id="ns-home" value={f.homepage} onChange={set("homepage")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ns-adr">Adresse</Label>
                <Input id="ns-adr" value={f.adresse} onChange={set("adresse")} />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select
                  value={f.status}
                  onValueChange={(v) => setF((p) => ({ ...p, status: (v as string) ?? "Neu" }))}
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
              <div className="space-y-1.5">
                <Label htmlFor="ns-ek">Erstkontakt am</Label>
                <Input id="ns-ek" type="date" value={f.erstkontakt_am} onChange={set("erstkontakt_am")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ns-wv">Wiedervorlage am</Label>
                <Input id="ns-wv" type="date" value={f.wiedervorlage_am} onChange={set("wiedervorlage_am")} />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Anlegen
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
