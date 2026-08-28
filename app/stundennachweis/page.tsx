import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Folder } from "lucide-react";

import { AppHeader } from "@/components/app/app-header";
import { LeitungAvatar } from "@/components/app/leitung-avatar";
import { Card } from "@/components/ui/card";
import { isAdmin, requireLeitung } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Leitung } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function StundennachweisPage() {
  const me = await requireLeitung();

  // SL sieht nur den eigenen Ordner -> direkt hinein.
  if (!isAdmin(me)) {
    redirect(`/stundennachweis/${me.id}`);
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("leitungen")
    .select("id, name, kuerzel, farbe")
    .eq("rolle", "leitung")
    .eq("aktiv", true)
    .order("name");
  const leitungen = (data ?? []) as Pick<Leitung, "id" | "name" | "kuerzel" | "farbe">[];

  return (
    <>
      <AppHeader leitung={me} />
      <main className="mx-auto max-w-3xl px-4 py-6">
        <div className="mb-4">
          <h1 className="text-lg font-semibold">Stundennachweis</h1>
          <p className="text-sm text-muted-foreground">
            Ein Ordner pro Standortleitung. Klick öffnet die Monatsseiten.
          </p>
        </div>
        {leitungen.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Keine aktiven Standortleitungen.
          </p>
        ) : (
          <ul className="space-y-2">
            {leitungen.map((l) => (
              <li key={l.id}>
                <Card className="p-0">
                  <Link
                    href={`/stundennachweis/${l.id}`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/60"
                  >
                    <Folder className="size-5 text-muted-foreground" />
                    <LeitungAvatar leitung={l} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {l.name}
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </Link>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
