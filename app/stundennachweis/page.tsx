import { AppHeader } from "@/components/app/app-header";
import { isAdmin, requireLeitung } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/dates";
import {
  auswerten,
  wochenImZeitraum,
  zeitraumFuer,
  zeitraumListe,
  type CallEintrag,
  type OrgaEintrag,
  type StundenEintrag,
  type TerminEintrag,
  type Vertragsmodell,
  type VertragZuweisung,
} from "@/lib/abrechnung";
import type { Leitung } from "@/lib/types";
import { StundennachweisClient } from "./stundennachweis-client";

export const dynamic = "force-dynamic";

export default async function StundennachweisPage({
  searchParams,
}: {
  searchParams: { sl?: string; zeitraum?: string };
}) {
  const me = await requireLeitung();
  const supabase = await createClient();
  const admin = isAdmin(me);

  // SL-Auswahl: Admin wählt, SL sieht sich selbst.
  let slListe: Pick<Leitung, "id" | "name" | "kuerzel" | "farbe">[] = [];
  let targetId = me.id;
  let targetName = me.name;
  if (admin) {
    const { data } = await supabase
      .from("leitungen")
      .select("id, name, kuerzel, farbe")
      .eq("rolle", "leitung")
      .eq("aktiv", true)
      .order("name");
    slListe = (data ?? []) as typeof slListe;
    const chosen = searchParams.sl && slListe.find((l) => l.id === searchParams.sl);
    if (chosen) {
      targetId = chosen.id;
      targetName = chosen.name;
    } else if (slListe.length > 0) {
      targetId = slListe[0].id;
      targetName = slListe[0].name;
    }
  }

  // Zeitraum-Auswahl.
  const zeitraeume = zeitraumListe(todayISO(), 11);
  const selected =
    (searchParams.zeitraum &&
      zeitraeume.find((z) => z.key === searchParams.zeitraum)) ||
    zeitraumFuer(todayISO());

  const wochen = wochenImZeitraum(selected);
  const min = (a: string, b: string) => (a < b ? a : b);
  const max = (a: string, b: string) => (a > b ? a : b);
  let rangeStart = selected.startISO;
  let rangeEnd = selected.endISO;
  if (wochen.length) {
    rangeStart = min(rangeStart, wochen[0].montagISO);
    rangeEnd = max(rangeEnd, wochen[wochen.length - 1].sonntagISO);
  }

  const [
    { data: anrufeData },
    { data: orgaData },
    { data: stundenData },
    { data: vertragData },
    { data: modelleData },
    { data: mehrarbeitData },
  ] = await Promise.all([
    supabase
      .from("anrufe")
      .select("id, datum, typ, ergebnis, text, schule:schule_id(name)")
      .eq("leitung_id", targetId)
      .gte("datum", `${rangeStart}T00:00:00`)
      .lte("datum", `${rangeEnd}T23:59:59`)
      .order("datum", { ascending: true }),
    supabase
      .from("orga_zeiten")
      .select("*")
      .eq("leitung_id", targetId)
      .gte("datum", rangeStart)
      .lte("datum", rangeEnd),
    supabase
      .from("arbeitsstunden")
      .select("*")
      .eq("leitung_id", targetId)
      .gte("datum", rangeStart)
      .lte("datum", rangeEnd),
    supabase
      .from("leitung_vertrag")
      .select("vertragsmodell_id, gilt_ab")
      .eq("leitung_id", targetId),
    supabase.from("vertragsmodelle").select("*").order("name"),
    supabase
      .from("mehrarbeit_bestaetigung")
      .select("woche_start")
      .eq("leitung_id", targetId),
  ]);

  type AnrufRow = {
    id: string;
    datum: string;
    typ: string;
    ergebnis: string | null;
    text: string | null;
    schule: { name: string } | null;
  };
  const anrufe = (anrufeData ?? []) as unknown as AnrufRow[];
  const calls: CallEintrag[] = anrufe
    .filter((a) => a.typ === "telefonat" && a.ergebnis === "erreicht")
    .map((a) => ({
      id: a.id,
      datumISO: a.datum.slice(0, 10),
      schuleName: a.schule?.name ?? null,
      notiz: a.text,
    }));
  const termine: TerminEintrag[] = anrufe
    .filter((a) => a.typ === "vor_ort")
    .map((a) => ({
      id: a.id,
      datumISO: a.datum.slice(0, 10),
      schuleName: a.schule?.name ?? null,
      notiz: a.text,
    }));

  type OrgaRow = {
    id: string;
    datum: string;
    dauer_minuten: number;
    kategorie: "meeting_teamleitung" | "orga";
    beschreibung: string | null;
  };
  const orga: OrgaEintrag[] = ((orgaData ?? []) as OrgaRow[]).map((o) => ({
    id: o.id,
    datumISO: o.datum.slice(0, 10),
    minuten: o.dauer_minuten,
    kategorie: o.kategorie,
    beschreibung: o.beschreibung,
  }));

  type StundenRow = {
    id: string;
    datum: string;
    minuten: number;
    von: string | null;
    bis: string | null;
    notiz: string | null;
  };
  const stundenRows = (stundenData ?? []) as StundenRow[];
  const stunden: StundenEintrag[] = stundenRows.map((s) => ({
    id: s.id,
    datumISO: s.datum.slice(0, 10),
    minuten: s.minuten,
    notiz: s.notiz,
  }));

  const zuweisungen = (vertragData ?? []) as VertragZuweisung[];
  const modelle = (modelleData ?? []) as Vertragsmodell[];

  const auswertung = auswerten({
    zeitraum: selected,
    modelle,
    zuweisungen,
    calls,
    termine,
    orga,
    stunden,
  });

  const bestaetigt = ((mehrarbeitData ?? []) as { woche_start: string }[]).map(
    (r) => r.woche_start,
  );

  return (
    <>
      <AppHeader leitung={me} />
      <StundennachweisClient
        istAdmin={admin}
        targetId={targetId}
        targetName={targetName}
        slListe={slListe}
        zeitraeume={zeitraeume}
        selectedKey={selected.key}
        auswertung={auswertung}
        bestaetigtWochen={bestaetigt}
      />
    </>
  );
}
