import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { AppHeader } from "@/components/app/app-header";
import { LeitungAvatar } from "@/components/app/leitung-avatar";
import { Card } from "@/components/ui/card";
import { isAdmin, requireLeitung } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Leitung } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const me = await requireLeitung();

  // Standortleitungen sehen nur ihre eigenen Protokolle -> direkt dorthin.
  if (!isAdmin(me)) {
    redirect(`/team/${me.id}`);
  }

  const supabase = await createClient();
  const [{ data: leitungenData }, { data: protData }] = await Promise.all([
    supabase
      .from("leitungen")
      .select("*")
      .eq("rolle", "leitung")
      .eq("aktiv", true)
      .order("name"),
    supabase.from("gespraechsprotokolle").select("leitung_id"),
  ]);

  const leitungen = (leitungenData ?? []) as Leitung[];
  const counts: Record<string, number> = {};
  for (const p of (protData ?? []) as { leitung_id: string }[]) {
    counts[p.leitung_id] = (counts[p.leitung_id] ?? 0) + 1;
  }

  return (
    <>
      <AppHeader leitung={me} />
      <main className="mx-auto max-w-3xl px-4 py-6">
        <div className="mb-4">
          <h1 className="text-lg font-semibold">Team · Gesprächsprotokolle</h1>
          <p className="text-sm text-muted-foreground">
            Wähle eine Standortleitung, um ihre 1:1-Protokolle zu sehen.
          </p>
        </div>

        {leitungen.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Keine aktiven Standortleitungen vorhanden.
          </p>
        ) : (
          <ul className="space-y-2">
            {leitungen.map((l) => (
              <li key={l.id}>
                <Card className="p-0">
                  <Link
                    href={`/team/${l.id}`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/60"
                  >
                    <LeitungAvatar leitung={l} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {l.name}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {counts[l.id] ?? 0}{" "}
                        {(counts[l.id] ?? 0) === 1 ? "Protokoll" : "Protokolle"}
                      </span>
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
