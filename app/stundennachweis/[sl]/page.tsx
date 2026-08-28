import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { AppHeader } from "@/components/app/app-header";
import { isAdmin, requireLeitung } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/dates";
import {
  MONATE_KURZ,
  zeitraumFuer,
  zeitraumFuerMonat,
  zeitraumListe,
  zeitraumMonat,
} from "@/lib/abrechnung";
import { OrdnerNavigation, type MonatsKachel } from "./ordner-navigation";

export const dynamic = "force-dynamic";

export default async function OrdnerPage({
  params,
}: {
  params: { sl: string };
}) {
  const me = await requireLeitung();
  const admin = isAdmin(me);
  if (!admin && me.id !== params.sl) {
    redirect(`/stundennachweis/${me.id}`);
  }

  const supabase = await createClient();
  const { data: sl } = await supabase
    .from("leitungen")
    .select("id, name")
    .eq("id", params.sl)
    .maybeSingle();
  if (!sl) notFound();

  const heute = todayISO();
  const aktuell = zeitraumFuer(heute);
  const aktuellMonat = zeitraumMonat(aktuell);

  // Jahres-Register aus den vergangenen Perioden (plus laufendes Jahr).
  const jahre = Array.from(
    new Set(zeitraumListe(heute, 17).map((z) => zeitraumMonat(z).jahr)),
  ).sort((a, b) => a - b);

  // Monatskacheln je Jahr — bis einschließlich des aktuellen Abrechnungsmonats.
  const kacheln: Record<number, MonatsKachel[]> = {};
  for (const jahr of jahre) {
    const bisMonat = jahr < aktuellMonat.jahr ? 12 : aktuellMonat.monat;
    const arr: MonatsKachel[] = [];
    for (let monat = 1; monat <= bisMonat; monat++) {
      const z = zeitraumFuerMonat(jahr, monat);
      arr.push({
        monat,
        key: z.key,
        label: MONATE_KURZ[monat - 1],
        aktuell: z.key === aktuell.key,
      });
    }
    kacheln[jahr] = arr;
  }

  return (
    <>
      <AppHeader leitung={me} />
      <main className="mx-auto max-w-3xl px-4 py-6">
        {admin && (
          <Link
            href="/stundennachweis"
            className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
            Alle Standortleitungen
          </Link>
        )}
        <div className="mb-4">
          <h1 className="text-lg font-semibold">{(sl as { name: string }).name}</h1>
          <p className="text-sm text-muted-foreground">
            Monatsseiten — Monat wählen (Abrechnungszeitraum jeweils 26.–25.)
          </p>
        </div>
        <OrdnerNavigation
          slId={params.sl}
          jahre={jahre}
          defaultJahr={aktuellMonat.jahr}
          kacheln={kacheln}
        />
      </main>
    </>
  );
}
