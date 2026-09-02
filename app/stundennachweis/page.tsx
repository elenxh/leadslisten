import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Folder } from "lucide-react";

import { AppHeader } from "@/components/app/app-header";
import { LeitungAvatar } from "@/components/app/leitung-avatar";
import { Card } from "@/components/ui/card";
import { isAdmin, requireLeitung } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/dates";
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

  // Offene Aufgaben je SL (Admin-Übersicht: wer hat wie viel offen/überfällig).
  const heute = todayISO();
  const offenByLeitung = new Map<string, { offen: number; ueberfaellig: number }>();
  {
    const { data: aufgabenData } = await supabase
      .from("gespraechsprotokoll_aufgaben")
      .select("zugewiesen_an, bis_wann")
      .eq("erledigt", false);
    for (const a of (aufgabenData ?? []) as { zugewiesen_an: string; bis_wann: string }[]) {
      const e = offenByLeitung.get(a.zugewiesen_an) ?? { offen: 0, ueberfaellig: 0 };
      e.offen += 1;
      if (a.bis_wann.slice(0, 10) < heute) e.ueberfaellig += 1;
      offenByLeitung.set(a.zugewiesen_an, e);
    }
  }

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
                    {(() => {
                      const a = offenByLeitung.get(l.id);
                      if (!a || a.offen === 0) return null;
                      return (
                        <span className="flex shrink-0 items-center gap-1.5 text-xs">
                          {a.ueberfaellig > 0 && (
                            <span className="rounded-full bg-red-100 px-1.5 py-0.5 font-medium text-red-700 dark:bg-red-950 dark:text-red-200">
                              {a.ueberfaellig} überfällig
                            </span>
                          )}
                          <span className="rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground">
                            {a.offen} Aufgabe{a.offen === 1 ? "" : "n"}
                          </span>
                        </span>
                      );
                    })()}
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
