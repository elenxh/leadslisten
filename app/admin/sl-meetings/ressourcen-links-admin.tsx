"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  Link2,
  Loader2,
  Pencil,
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
import { cn } from "@/lib/utils";
import type { RessourcenLink } from "@/lib/types";
import {
  createRessourcenLink,
  deleteRessourcenLink,
  moveRessourcenLink,
  updateRessourcenLink,
  type RessourcenLinkInput,
} from "./actions";

export function RessourcenLinksAdmin({ links }: { links: RessourcenLink[] }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Wichtige Links</h2>
          <p className="text-sm text-muted-foreground">
            Dauerhafte Links für alle SLs (z. B. Drive-Ordner) — erscheinen im SL-Bereich.
          </p>
        </div>
        <LinkDialog />
      </div>

      <div className="space-y-2">
        {links.length === 0 && (
          <p className="text-sm text-muted-foreground">Noch keine Links.</p>
        )}
        {links.map((l, i) => (
          <Card key={l.id} className={cn(!l.aktiv && "opacity-60")}>
            <CardContent className="flex items-start justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Link2 className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{l.titel}</span>
                  {!l.aktiv && (
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      inaktiv
                    </span>
                  )}
                </p>
                {l.beschreibung && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{l.beschreibung}</p>
                )}
                <a
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-0.5 inline-flex items-center gap-1 truncate text-xs text-primary hover:underline"
                >
                  {l.url}
                  <ExternalLink className="size-3" />
                </a>
              </div>
              <span className="flex shrink-0 items-center gap-1">
                <MoveButton id={l.id} dir="up" disabled={i === 0} />
                <MoveButton id={l.id} dir="down" disabled={i === links.length - 1} />
                <LinkDialog link={l} />
                <LoeschButton id={l.id} />
              </span>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

function MoveButton({ id, dir, disabled }: { id: string; dir: "up" | "down"; disabled: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-8 text-muted-foreground"
      aria-label={dir === "up" ? "Nach oben" : "Nach unten"}
      disabled={disabled || pending}
      onClick={() =>
        start(async () => {
          const res = await moveRessourcenLink(id, dir);
          if (!res.ok) { toast.error("Verschieben fehlgeschlagen", { description: res.error }); return; }
          router.refresh();
        })
      }
    >
      {dir === "up" ? <ArrowUp className="size-4" /> : <ArrowDown className="size-4" />}
    </Button>
  );
}

function LoeschButton({ id }: { id: string }) {
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
          const res = await deleteRessourcenLink(id);
          if (!res.ok) { toast.error("Löschen fehlgeschlagen", { description: res.error }); return; }
          router.refresh();
        })
      }
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
    </Button>
  );
}

function LinkDialog({ link }: { link?: RessourcenLink }) {
  const router = useRouter();
  const isEdit = !!link;
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [titel, setTitel] = useState(link?.titel ?? "");
  const [url, setUrl] = useState(link?.url ?? "");
  const [beschreibung, setBeschreibung] = useState(link?.beschreibung ?? "");
  const [aktiv, setAktiv] = useState(link?.aktiv ?? true);

  function save() {
    const felder: RessourcenLinkInput = {
      titel,
      url,
      beschreibung: beschreibung || null,
      aktiv,
    };
    start(async () => {
      const res = link
        ? await updateRessourcenLink(link.id, felder)
        : await createRessourcenLink(felder);
      if (!res.ok) { toast.error("Speichern fehlgeschlagen", { description: res.error }); return; }
      toast.success("Gespeichert");
      setOpen(false);
      router.refresh();
    });
  }

  const valid = titel.trim() && url.trim();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          isEdit ? (
            <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="Bearbeiten" />
          ) : (
            <Button type="button" size="sm" data-testid="link-add" />
          )
        }
      >
        {isEdit ? <Pencil className="size-4" /> : (<><Plus className="mr-1.5 size-4" />Neuer Link</>)}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Link bearbeiten" : "Neuer Link"}</DialogTitle>
          <DialogDescription>Erscheint bei den SLs in der Box „Wichtige Links“.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>Titel</Label>
            <Input value={titel} onChange={(e) => setTitel(e.target.value)} placeholder="z. B. Drive-Ordner" data-testid="link-titel" />
          </div>
          <div className="space-y-1.5">
            <Label>URL</Label>
            <Input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" data-testid="link-url" />
          </div>
          <div className="space-y-1.5">
            <Label>Beschreibung (optional)</Label>
            <Textarea rows={2} value={beschreibung} onChange={(e) => setBeschreibung(e.target.value)} placeholder="Kurz erklären, was die SL hier findet…" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={aktiv}
              onChange={(e) => setAktiv(e.target.checked)}
              className="size-4"
              data-testid="link-aktiv"
            />
            Aktiv (für SLs sichtbar)
          </label>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={pending || !valid} data-testid="link-save">
            {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
