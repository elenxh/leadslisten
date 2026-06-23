"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LeitungAvatar } from "@/components/app/leitung-avatar";
import { createLeitung, setLeitungAktiv } from "./actions";
import type { Leitung, Rolle } from "@/lib/types";

const PRESET_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6",
  "#3b82f6", "#6366f1", "#a855f7", "#ec4899", "#64748b",
];

export function LeitungenClient({
  leitungen,
  schulCount,
}: {
  leitungen: Leitung[];
  schulCount: Record<string, number>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="mx-auto max-w-4xl space-y-4 px-4 py-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Leitungen</h1>
          <p className="text-sm text-muted-foreground">
            {leitungen.length} {leitungen.length === 1 ? "Person" : "Personen"}
          </p>
        </div>
        <CreateLeitungDialog />
      </div>

      <div className="grid gap-3">
        {leitungen.map((l) => (
          <Card key={l.id}>
            <CardContent className="flex items-center gap-3 p-3 sm:p-4">
              <LeitungAvatar leitung={l} className="size-9" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{l.name}</span>
                  {l.rolle === "admin" && (
                    <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                      Admin
                    </Badge>
                  )}
                  {!l.aktiv && (
                    <Badge variant="secondary" className="text-muted-foreground">
                      inaktiv
                    </Badge>
                  )}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {l.email}
                  {l.region ? ` · ${l.region}` : ""} · {schulCount[l.id] ?? 0}{" "}
                  Schulen
                </p>
              </div>
              <Button
                variant={l.aktiv ? "outline" : "default"}
                size="sm"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const res = await setLeitungAktiv(l.id, !l.aktiv);
                    if (!res.ok) {
                      toast.error("Fehlgeschlagen", { description: res.error });
                    } else {
                      toast.success(l.aktiv ? "Deaktiviert" : "Aktiviert");
                      router.refresh();
                    }
                  })
                }
              >
                {l.aktiv ? "Deaktivieren" : "Aktivieren"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function CreateLeitungDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tempPw, setTempPw] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [kuerzel, setKuerzel] = useState("");
  const [region, setRegion] = useState("");
  const [farbe, setFarbe] = useState(PRESET_COLORS[5]);
  const [rolle, setRolle] = useState<Rolle>("leitung");

  function resetForm() {
    setName("");
    setEmail("");
    setKuerzel("");
    setRegion("");
    setFarbe(PRESET_COLORS[5]);
    setRolle("leitung");
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const res = await createLeitung({ name, email, kuerzel, farbe, region, rolle });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setTempPw(res.tempPassword);
    resetForm();
    router.refresh();
  }

  function closeAll() {
    setOpen(false);
    setTempPw(null);
    setCopied(false);
    resetForm();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) closeAll();
        else setOpen(true);
      }}
    >
      <DialogTrigger render={<Button />}>
        <UserPlus className="mr-2 size-4" />
        Leitung anlegen
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        {tempPw ? (
          <>
            <DialogHeader>
              <DialogTitle>Leitung angelegt</DialogTitle>
              <DialogDescription>
                Gib dieses temporäre Passwort an die Person weiter. Beim ersten
                Login muss es geändert werden. Es wird nur einmal angezeigt.
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2 rounded-md border bg-muted/50 p-3">
              <code className="flex-1 select-all text-sm">{tempPw}</code>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(tempPw);
                    setCopied(true);
                    toast.success("Passwort kopiert");
                  } catch {
                    toast.error("Kopieren nicht möglich");
                  }
                }}
              >
                {copied ? (
                  <Check className="size-4" />
                ) : (
                  <Copy className="size-4" />
                )}
              </Button>
            </div>
            <DialogFooter>
              <Button onClick={closeAll}>Fertig</Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>Neue Leitung anlegen</DialogTitle>
              <DialogDescription>
                Legt einen Login an. Die Person erhält ein temporäres Passwort.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-3">
              <div className="space-y-2">
                <Label htmlFor="l-name">Name</Label>
                <Input id="l-name" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="l-email">E-Mail</Label>
                <Input
                  id="l-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="l-kuerzel">Kürzel</Label>
                  <Input
                    id="l-kuerzel"
                    value={kuerzel}
                    onChange={(e) => setKuerzel(e.target.value)}
                    maxLength={3}
                    placeholder="z. B. PN"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Rolle</Label>
                  <Select value={rolle} onValueChange={(v) => setRolle((v as Rolle) ?? "leitung")}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="leitung">Standortleitung</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="l-region">Region</Label>
                <Input
                  id="l-region"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  placeholder="z. B. Nord / Ring 1"
                />
              </div>
              <div className="space-y-2">
                <Label>Farbe</Label>
                <div className="flex flex-wrap items-center gap-2">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setFarbe(c)}
                      className="size-7 rounded-full border-2 transition"
                      style={{
                        backgroundColor: c,
                        borderColor: farbe === c ? "var(--foreground)" : "transparent",
                      }}
                      aria-label={c}
                    />
                  ))}
                  <input
                    type="color"
                    value={farbe}
                    onChange={(e) => setFarbe(e.target.value)}
                    className="size-7 cursor-pointer rounded border bg-transparent p-0"
                    aria-label="Eigene Farbe"
                  />
                </div>
              </div>

              {error && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}
            </div>

            <DialogFooter>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
                Anlegen
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
