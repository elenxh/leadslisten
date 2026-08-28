import { redirect } from "next/navigation";
import Link from "next/link";
import { Download } from "lucide-react";

import { AppHeader } from "@/components/app/app-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { isAdmin, requireLeitung } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/dates";
import { stundenAusMinuten, rundeCalls, zeitraumFuer, zeitraumListe } from "@/lib/abrechnung";
import { ladeUebersicht } from "@/lib/stundennachweis-data";
import { ZeitraumWahl } from "./zeitraum-wahl";

export const dynamic = "force-dynamic";

export default async function AbrechnungPage({
  searchParams,
}: {
  searchParams: { zeitraum?: string };
}) {
  const me = await requireLeitung();
  if (!isAdmin(me)) redirect("/dashboard");

  const supabase = await createClient();
  const zeitraeume = zeitraumListe(todayISO(), 11);
  const zeitraum =
    (searchParams.zeitraum && zeitraeume.find((z) => z.key === searchParams.zeitraum)) ||
    zeitraumFuer(todayISO());

  const zeilen = await ladeUebersicht(supabase, zeitraum);

  return (
    <>
      <AppHeader leitung={me} />
      <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Abrechnungs-Übersicht</h1>
            <p className="text-sm text-muted-foreground">
              Zeitraum {zeitraum.label} · Stücklohn (Calls/Termine) und Stundenlohn
              (Meetings/Orga) getrennt.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ZeitraumWahl zeitraeume={zeitraeume} selectedKey={zeitraum.key} />
            <Button size="sm" render={<Link href={`/admin/abrechnung/export?zeitraum=${zeitraum.key}`} />}>
              <Download className="mr-1.5 size-4" />
              Excel-Export
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">SL</th>
                  <th className="px-3 py-2 font-medium">Standort(e)</th>
                  <th className="px-3 py-2 font-medium">Vertragsmodell</th>
                  <th className="px-3 py-2 text-right font-medium">Calls</th>
                  <th className="px-3 py-2 text-right font-medium">Termine</th>
                  <th className="border-l px-3 py-2 text-right font-medium">Meeting (min)</th>
                  <th className="px-3 py-2 text-right font-medium">Orga (min)</th>
                  <th className="border-l px-3 py-2 text-right font-medium">Berechnet (h)</th>
                  <th className="px-3 py-2 text-right font-medium">Angegeben (h)</th>
                  <th className="px-3 py-2 text-right font-medium">Mehrarbeit</th>
                </tr>
              </thead>
              <tbody>
                {zeilen.map((z) => (
                  <tr key={z.slId} className="border-b last:border-0">
                    <td className="px-3 py-2 font-medium">{z.slName}</td>
                    <td className="px-3 py-2 text-muted-foreground">{z.standorte.join(", ") || "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{z.modellName ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{z.callsCount}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{z.termineCount}</td>
                    <td className="border-l px-3 py-2 text-right tabular-nums">{z.meetingMin}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{z.orgaMin}</td>
                    <td className="border-l px-3 py-2 text-right tabular-nums">{stundenAusMinuten(z.berechneteMin)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{stundenAusMinuten(z.angegebeneMin)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{z.mehrarbeitCalls > 0 ? rundeCalls(z.mehrarbeitCalls) : "—"}</td>
                  </tr>
                ))}
                {zeilen.length === 0 && (
                  <tr><td colSpan={10} className="px-3 py-6 text-center text-muted-foreground">Keine Standortleitungen.</td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          Der Excel-Export enthält zusätzlich ein Blatt „Wochen“ (pro SL und
          Kalenderwoche: Termine, Calls, Orga, Meetings).
        </p>
      </main>
    </>
  );
}
