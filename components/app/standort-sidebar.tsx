"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Inbox,
  Loader2,
  MapPin,
  MapPinned,
  Plus,
  X,
} from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { ChipMultiSelect } from "@/components/app/chip-multiselect";
import { cn } from "@/lib/utils";
import {
  approveStandort,
  createStandort,
  proposeStandort,
  rejectStandort,
} from "@/app/standorte/actions";
import type { Leitung, Standort, StandortMitVorschlag } from "@/lib/types";

export const STANDORT_ALLE = "__all__";
export const STANDORT_OHNE = "__none__";

export interface SidebarData {
  standorte: Standort[]; // sichtbare aktive Standorte
  vorgeschlagen: StandortMitVorschlag[]; // nur Admin
  counts: Record<string, number>; // standort_id -> Anzahl Schulen
  ohneCount: number; // Schulen ohne Standort
  total: number; // alle Schulen (im Scope)
}

export function StandortSidebar({
  data,
  value,
  onChange,
  isAdmin,
  leitungen,
  className,
}: {
  data: SidebarData;
  value: string;
  onChange: (v: string) => void;
  isAdmin: boolean;
  leitungen: Pick<Leitung, "id" | "name">[];
  className?: string;
}) {
  return (
    <nav className={cn("space-y-1", className)}>
      <SidebarItem
        label="Alle Schulen"
        icon={<MapPinned className="size-4" />}
        count={data.total}
        active={value === STANDORT_ALLE}
        onClick={() => onChange(STANDORT_ALLE)}
      />

      <div className="pt-1">
        <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
          Standorte
        </p>
        {data.standorte.length === 0 ? (
          <p className="px-2 py-1 text-xs text-muted-foreground">
            {isAdmin
              ? "Noch keine Standorte angelegt."
              : "Dir ist noch kein Standort zugewiesen."}
          </p>
        ) : (
          data.standorte.map((s) => (
            <SidebarItem
              key={s.id}
              label={s.name}
              icon={<MapPin className="size-4" />}
              count={data.counts[s.id] ?? 0}
              active={value === s.id}
              onClick={() => onChange(s.id)}
            />
          ))
        )}
      </div>

      {isAdmin && (
        <SidebarItem
          label="Ohne Standort"
          icon={<Inbox className="size-4" />}
          count={data.ohneCount}
          active={value === STANDORT_OHNE}
          onClick={() => onChange(STANDORT_OHNE)}
          muted
        />
      )}

      {isAdmin && data.vorgeschlagen.length > 0 && (
        <VorschlaegeSection
          vorschlaege={data.vorgeschlagen}
          leitungen={leitungen}
        />
      )}

      <div className="pt-2">
        {isAdmin ? (
          <NeuerStandortDialog />
        ) : (
          <StandortVorschlagenDialog />
        )}
      </div>
    </nav>
  );
}

function SidebarItem({
  label,
  icon,
  count,
  active,
  onClick,
  muted,
}: {
  label: string;
  icon: React.ReactNode;
  count: number;
  active: boolean;
  onClick: () => void;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
        active
          ? "bg-primary/10 font-medium text-primary"
          : "hover:bg-muted text-foreground",
        muted && !active && "text-muted-foreground",
      )}
    >
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span
        className={cn(
          "shrink-0 rounded-full px-1.5 text-xs tabular-nums",
          active ? "bg-primary/15 text-primary" : "text-muted-foreground",
        )}
      >
        {count}
      </span>
    </button>
  );
}

// --- Vorgeschlagene Standorte (Admin) ---------------------------------
function VorschlaegeSection({
  vorschlaege,
  leitungen,
}: {
  vorschlaege: StandortMitVorschlag[];
  leitungen: Pick<Leitung, "id" | "name">[];
}) {
  return (
    <div className="pt-2">
      <p className="flex items-center gap-2 px-2 py-1 text-xs font-medium text-muted-foreground">
        Vorgeschlagene Standorte
        <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          {vorschlaege.length}
        </Badge>
      </p>
      <div className="space-y-1">
        {vorschlaege.map((v) => (
          <VorschlagDialog key={v.id} vorschlag={v} leitungen={leitungen} />
        ))}
      </div>
    </div>
  );
}

function VorschlagDialog({
  vorschlag,
  leitungen,
}: {
  vorschlag: StandortMitVorschlag;
  leitungen: Pick<Leitung, "id" | "name">[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [assign, setAssign] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  function approve() {
    startTransition(async () => {
      const res = await approveStandort(vorschlag.id, assign);
      if (!res.ok) {
        toast.error("Freigabe fehlgeschlagen", { description: res.error });
        return;
      }
      toast.success(`„${vorschlag.name}" freigegeben`);
      setOpen(false);
      router.refresh();
    });
  }

  function reject() {
    startTransition(async () => {
      const res = await rejectStandort(vorschlag.id);
      if (!res.ok) {
        toast.error("Ablehnen fehlgeschlagen", { description: res.error });
        return;
      }
      toast.success(`„${vorschlag.name}" abgelehnt`);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md border border-dashed border-amber-300 px-2 py-1.5 text-left text-sm text-amber-800 transition-colors hover:bg-amber-50 dark:border-amber-800 dark:text-amber-200 dark:hover:bg-amber-950/40"
          />
        }
      >
        <MapPin className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{vorschlag.name}</span>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Standort prüfen</DialogTitle>
          <DialogDescription>
            „{vorschlag.name}“ wurde
            {vorschlag.vorschlagende
              ? ` von ${vorschlag.vorschlagende.name}`
              : ""}{" "}
            vorgeschlagen. Bei Freigabe kannst du direkt Leitung(en) zuweisen.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Label>Leitung(en) zuweisen (optional)</Label>
          <ChipMultiSelect
            options={leitungen.map((l) => ({ id: l.id, label: l.name }))}
            value={assign}
            onChange={setAssign}
            emptyHint="Keine aktiven Leitungen."
          />
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            variant="outline"
            onClick={reject}
            disabled={pending}
            className="text-destructive hover:text-destructive"
          >
            <X className="mr-1.5 size-4" />
            Ablehnen
          </Button>
          <Button onClick={approve} disabled={pending}>
            {pending ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <Check className="mr-1.5 size-4" />
            )}
            Freigeben
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Standort vorschlagen (Leitung) -----------------------------------
function StandortVorschlagenDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await proposeStandort(name);
      if (!res.ok) {
        toast.error("Vorschlag fehlgeschlagen", { description: res.error });
        return;
      }
      toast.success("Vorschlag eingereicht", {
        description: "Wird dem Admin zur Freigabe vorgelegt.",
      });
      setName("");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setName("");
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="w-full justify-start" />
        }
      >
        <Plus className="mr-1.5 size-4" />
        Standort vorschlagen
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Standort vorschlagen</DialogTitle>
            <DialogDescription>
              Wird dem Admin zur Freigabe vorgelegt. Nach Freigabe erscheint er
              in der Seitenleiste.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-3">
            <Label htmlFor="vorschlag-name">Name</Label>
            <Input
              id="vorschlag-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z. B. Potsdam"
              required
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Vorschlagen
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// --- Standort anlegen (Admin) -----------------------------------------
function NeuerStandortDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await createStandort(name);
      if (!res.ok) {
        toast.error("Anlegen fehlgeschlagen", { description: res.error });
        return;
      }
      toast.success(`Standort „${res.standort.name}" angelegt`);
      setName("");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setName("");
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="w-full justify-start" />
        }
      >
        <Plus className="mr-1.5 size-4" />
        Standort anlegen
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Neuen Standort anlegen</DialogTitle>
            <DialogDescription>
              Wird direkt aktiv und ist sofort in der Seitenleiste verfügbar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-3">
            <Label htmlFor="standort-name">Name</Label>
            <Input
              id="standort-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z. B. Bonn"
              required
              autoFocus
            />
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
