import * as XLSX from "xlsx";

import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/dates";
import { zeitraumFuer, zeitraumListe } from "@/lib/abrechnung";
import { baueAbrechnungAOA, ladeUebersicht } from "@/lib/stundennachweis-data";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Nicht angemeldet.", { status: 401 });
  const { data: me } = await supabase.from("leitungen").select("rolle, aktiv").eq("id", user.id).single();
  if (!me || me.rolle !== "admin" || me.aktiv === false) {
    return new Response("Keine Berechtigung.", { status: 403 });
  }

  const url = new URL(request.url);
  const key = url.searchParams.get("zeitraum") ?? "";
  const zeitraeume = zeitraumListe(todayISO(), 11);
  const zeitraum = zeitraeume.find((z) => z.key === key) ?? zeitraumFuer(todayISO());

  const zeilen = await ladeUebersicht(supabase, zeitraum);
  const { uebersicht, wochen } = baueAbrechnungAOA(zeitraum.label, zeilen);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(uebersicht), "Übersicht");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(wochen), "Wochen");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const dateiname = `Abrechnung_${zeitraum.key}.xlsx`;

  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${dateiname}"`,
      "Cache-Control": "no-store",
    },
  });
}
