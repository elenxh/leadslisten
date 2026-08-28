import { notFound, redirect } from "next/navigation";

import { AppHeader } from "@/components/app/app-header";
import { isAdmin, requireLeitung } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  auswerten,
  wochenImZeitraum,
  zeitraumFuer,
  type Vertragsmodell,
  type VertragZuweisung,
} from "@/lib/abrechnung";
import { sammleEintraege } from "@/lib/stundennachweis-data";
import type { AdminKommentar } from "@/lib/types";
import { MonatClient } from "./monat-client";

export const dynamic = "force-dynamic";

export default async function MonatPage({
  params,
}: {
  params: { sl: string; zeitraum: string };
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

  const ref = /^\d{4}-\d{2}-\d{2}$/.test(params.zeitraum) ? params.zeitraum : undefined;
  const zeitraum = zeitraumFuer(ref ?? new Date().toISOString().slice(0, 10));

  const wochen = wochenImZeitraum(zeitraum);
  const min = (a: string, b: string) => (a < b ? a : b);
  const max = (a: string, b: string) => (a > b ? a : b);
  let rangeStart = zeitraum.startISO;
  let rangeEnd = zeitraum.endISO;
  if (wochen.length) {
    rangeStart = min(rangeStart, wochen[0].montagISO);
    rangeEnd = max(rangeEnd, wochen[wochen.length - 1].sonntagISO);
  }

  const targetId = params.sl;
  const [bundle, { data: vertragData }, { data: modelleData }, { data: tagNotizData }] =
    await Promise.all([
      sammleEintraege(supabase, targetId, rangeStart, rangeEnd),
      supabase.from("leitung_vertrag").select("vertragsmodell_id, gilt_ab").eq("leitung_id", targetId),
      supabase.from("vertragsmodelle").select("*").order("name"),
      supabase.from("tag_notizen").select("datum, notiz").eq("leitung_id", targetId).gte("datum", rangeStart).lte("datum", rangeEnd),
    ]);

  // Admin-Kommentare NUR für Admin laden (RLS blockt SL ohnehin).
  let adminKommentare: AdminKommentar[] = [];
  if (admin) {
    const { data } = await supabase
      .from("admin_kommentare")
      .select("*")
      .eq("leitung_id", targetId);
    adminKommentare = ((data ?? []) as AdminKommentar[]).filter(
      (k) =>
        (k.datum && k.datum >= rangeStart && k.datum <= rangeEnd) ||
        (!k.datum && k.zeitraum_start === zeitraum.startISO),
    );
  }

  const auswertung = auswerten({
    zeitraum,
    modelle: (modelleData ?? []) as Vertragsmodell[],
    zuweisungen: (vertragData ?? []) as VertragZuweisung[],
    ...bundle,
  });

  const tagNotizen = ((tagNotizData ?? []) as { datum: string; notiz: string | null }[]).map((t) => ({
    datum: t.datum.slice(0, 10),
    notiz: t.notiz,
  }));

  return (
    <>
      <AppHeader leitung={me} />
      <MonatClient
        istAdmin={admin}
        slId={targetId}
        slName={(sl as { name: string }).name}
        zeitraumStart={zeitraum.startISO}
        zeitraumLabel={zeitraum.label}
        auswertung={auswertung}
        tagNotizen={tagNotizen}
        adminKommentare={adminKommentare.map((k) => ({
          datum: k.datum,
          kommentar: k.kommentar,
          farbe: k.farbe,
        }))}
      />
    </>
  );
}
