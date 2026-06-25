"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail, Pencil, Phone, Plus, Trash2, User } from "lucide-react";
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
import {
  addKontakt,
  deleteKontakt,
  updateKontakt,
  type KontaktInput,
} from "@/app/standorte/actions";
import type { Kontakt } from "@/lib/types";

const EMPTY: KontaktInput = {
  name: "",
  rolle: "",
  telefon: "",
  email: "",
  notiz: "",
};

export function KontakteSection({
  schuleId,
  kontakte,
  editable,
}: {
  schuleId: string;
  kontakte: Kontakt[];
  editable: boolean;
}) {
  if (kontakte.length === 0 && !editable) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Weitere Ansprechpartner</p>
        {editable && (
          <KontaktDialog schuleId={schuleId} mode="add" trigger={
            <Button variant="outline" size="sm">
              <Plus className="mr-1.5 size-4" />
              Person
            </Button>
          } />
        )}
      </div>

      {kontakte.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Keine weiteren Ansprechpartner.
        </p>
      ) : (
        <ul className="space-y-2">
          {kontakte.map((k) => (
            <li
              key={k.id}
              className="flex items-start justify-between gap-3 rounded-md border p-3"
            >
              <div className="min-w-0 space-y-0.5 text-sm">
                <p className="flex items-center gap-1.5 font-medium">
                  <User className="size-3.5 shrink-0 text-muted-foreground" />
                  {k.name}
                  {k.rolle && (
                    <span className="font-normal text-muted-foreground">
                      · {k.rolle}
                    </span>
                  )}
                </p>
                {k.telefon && (
                  <p className="flex items-center gap-1.5 text-muted-foreground">
                    <Phone className="size-3.5 shrink-0" />
                    <a className="hover:underline" href={`tel:${k.telefon}`}>
                      {k.telefon}
                    </a>
                  </p>
                )}
                {k.email && (
                  <p className="flex items-center gap-1.5 text-muted-foreground">
                    <Mail className="size-3.5 shrink-0" />
                    <a className="hover:underline" href={`mailto:${k.email}`}>
                      {k.email}
                    </a>
                  </p>
                )}
                {k.notiz && (
                  <p className="whitespace-pre-wrap text-muted-foreground">
                    {k.notiz}
                  </p>
                )}
              </div>
              {editable && (
                <div className="flex shrink-0 gap-1">
                  <KontaktDialog
                    schuleId={schuleId}
                    mode="edit"
                    kontakt={k}
                    trigger={
                      <Button variant="ghost" size="icon" title="Bearbeiten">
                        <Pencil className="size-4" />
                      </Button>
                    }
                  />
                  <DeleteKontaktButton kontaktId={k.id} name={k.name} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DeleteKontaktButton({
  kontaktId,
  name,
}: {
  kontaktId: string;
  name: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const res = await deleteKontakt(kontaktId);
      if (!res.ok) {
        toast.error("Löschen fehlgeschlagen", { description: res.error });
        return;
      }
      toast.success(`„${name}" gelöscht`);
      router.refresh();
    });
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      title="Löschen"
      disabled={pending}
      onClick={remove}
      className="text-destructive hover:text-destructive"
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Trash2 className="size-4" />
      )}
    </Button>
  );
}

function KontaktDialog({
  schuleId,
  mode,
  kontakt,
  trigger,
}: {
  schuleId: string;
  mode: "add" | "edit";
  kontakt?: Kontakt;
  trigger: React.ReactElement;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<KontaktInput>(EMPTY);
  const [pending, startTransition] = useTransition();

  function openChange(o: boolean) {
    setOpen(o);
    if (o) {
      setForm(
        kontakt
          ? {
              name: kontakt.name,
              rolle: kontakt.rolle ?? "",
              telefon: kontakt.telefon ?? "",
              email: kontakt.email ?? "",
              notiz: kontakt.notiz ?? "",
            }
          : EMPTY,
      );
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Name ist erforderlich.");
      return;
    }
    startTransition(async () => {
      const res =
        mode === "edit" && kontakt
          ? await updateKontakt(kontakt.id, form)
          : await addKontakt(schuleId, form);
      if (!res.ok) {
        toast.error("Speichern fehlgeschlagen", { description: res.error });
        return;
      }
      toast.success(mode === "edit" ? "Gespeichert" : "Ansprechpartner hinzugefügt");
      setOpen(false);
      router.refresh();
    });
  }

  const set = (k: keyof KontaktInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={openChange}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>
              {mode === "edit" ? "Ansprechpartner bearbeiten" : "Ansprechpartner hinzufügen"}
            </DialogTitle>
            <DialogDescription>
              Zusätzliche Kontaktperson dieser Schule.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-3">
            <div className="space-y-2">
              <Label htmlFor="k-name">Name</Label>
              <Input id="k-name" value={form.name} onChange={set("name")} required autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="k-rolle">Rolle / Funktion</Label>
              <Input id="k-rolle" value={form.rolle ?? ""} onChange={set("rolle")} placeholder="z. B. Schulleitung" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="k-tel">Telefon</Label>
                <Input id="k-tel" value={form.telefon ?? ""} onChange={set("telefon")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="k-mail">E-Mail</Label>
                <Input id="k-mail" type="email" value={form.email ?? ""} onChange={set("email")} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="k-notiz">Notiz</Label>
              <Textarea id="k-notiz" rows={2} value={form.notiz ?? ""} onChange={set("notiz")} />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending || !form.name.trim()}>
              {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
              {mode === "edit" ? "Speichern" : "Hinzufügen"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
