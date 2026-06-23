"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

export function PasswortForm({
  leitungId,
  forced,
}: {
  leitungId: string;
  forced: boolean;
}) {
  const router = useRouter();
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (pw1.length < 8) {
      setError("Das Passwort muss mindestens 8 Zeichen lang sein.");
      return;
    }
    if (pw1 !== pw2) {
      setError("Die Passwörter stimmen nicht überein.");
      return;
    }

    setSaving(true);
    const supabase = createClient();

    const { error: authError } = await supabase.auth.updateUser({
      password: pw1,
    });
    if (authError) {
      setError(authError.message);
      setSaving(false);
      return;
    }

    await supabase
      .from("leitungen")
      .update({ passwort_geaendert: true })
      .eq("id", leitungId);

    toast.success("Passwort geändert");
    setSaving(false);
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="text-xl">Passwort ändern</CardTitle>
          <CardDescription>
            {forced
              ? "Bitte vergib zum Start ein eigenes Passwort."
              : "Lege ein neues Passwort fest."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pw1">Neues Passwort</Label>
              <Input
                id="pw1"
                type="password"
                autoComplete="new-password"
                required
                value={pw1}
                onChange={(e) => setPw1(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pw2">Passwort wiederholen</Label>
              <Input
                id="pw2"
                type="password"
                autoComplete="new-password"
                required
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
              />
            </div>

            {error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={saving}>
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
              Speichern
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
