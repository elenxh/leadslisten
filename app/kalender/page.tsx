import { AppHeader } from "@/components/app/app-header";
import { isAdmin, requireLeitung } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/dates";
import { addDaysISO, mondayOfISO } from "@/lib/abrechnung";
import type { Leitung } from "@/lib/types";
import { KalenderClient, type KalEintrag } from "./kalender-client";

export const dynamic = "force-dynamic";

const MONATE = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

function ersterDesMonats(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}
function letzterDesMonats(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  const naechster = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return addDaysISO(naechster, -1);
}
function plusMonate(iso: string, n: number): string {
  const [y, m] = iso.split("-").map(Number);
  const total = (y * 12 + (m - 1)) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}-01`;
}

export default async function KalenderPage({
  searchParams,
}: {
  searchParams: { view?: string; ref?: string; sl?: string };
}) {
  const me = await requireLeitung();
  const admin = isAdmin(me);
  const supabase = await createClient();

  const view = searchParams.view === "woche" ? "woche" : "monat";
  const refRaw = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.ref ?? "") ? (searchParams.ref as string) : todayISO();

  // Admin-SL-Filter.
  let sls: Pick<Leitung, "id" | "name">[] = [];
  let targetLeitung: string | null = admin ? null : me.id;
  if (admin) {
    const { data } = await supabase
      .from("leitungen").select("id, name").eq("rolle", "leitung").eq("aktiv", true).order("name");
    sls = (data ?? []) as Pick<Leitung, "id" | "name">[];
    if (searchParams.sl && sls.find((s) => s.id === searchParams.sl)) targetLeitung = searchParams.sl;
  }

  // Sichtbarer Bereich (Gitter beginnt am Montag).
  let title: string;
  let gridStart: string;
  let gridEnd: string;
  let prevRef: string;
  let nextRef: string;
  if (view === "woche") {
    gridStart = mondayOfISO(refRaw);
    gridEnd = addDaysISO(gridStart, 6);
    prevRef = addDaysISO(gridStart, -7);
    nextRef = addDaysISO(gridStart, 7);
    title = `Woche ${gridStart.slice(8)}.${gridStart.slice(5, 7)}. – ${gridEnd.slice(8)}.${gridEnd.slice(5, 7)}.${gridEnd.slice(0, 4)}`;
  } else {
    const mErster = ersterDesMonats(refRaw);
    const mLetzter = letzterDesMonats(refRaw);
    gridStart = mondayOfISO(mErster);
    gridEnd = addDaysISO(mondayOfISO(mLetzter), 6);
    prevRef = plusMonate(mErster, -1);
    nextRef = plusMonate(mErster, 1);
    title = `${MONATE[Number(mErster.slice(5, 7)) - 1]} ${mErster.slice(0, 4)}`;
  }
  const monatPrefix = view === "monat" ? refRaw.slice(0, 7) : "";

  // Standort-IDs des gefilterten SL (für Schul-Wiedervorlagen beim Admin-Filter).
  let standortIds: string[] | null = null;
  if (admin && targetLeitung) {
    const { data } = await supabase.from("leitung_standort").select("standort_id").eq("leitung_id", targetLeitung);
    standortIds = ((data ?? []) as { standort_id: string }[]).map((r) => r.standort_id);
  }

  const eintraege: KalEintrag[] = [];

  // 1) 1:1-Protokolle (Meeting am datum) + Protokoll-Wiedervorlagen.
  {
    let q = supabase
      .from("gespraechsprotokolle")
      .select("id, leitung_id, datum, uhrzeit, thema, wiedervorlage_am")
      .or(`and(datum.gte.${gridStart},datum.lte.${gridEnd}),and(wiedervorlage_am.gte.${gridStart},wiedervorlage_am.lte.${gridEnd})`);
    if (targetLeitung) q = q.eq("leitung_id", targetLeitung);
    const { data } = await q;
    for (const p of (data ?? []) as {
      id: string; leitung_id: string; datum: string; uhrzeit: string | null; thema: string | null; wiedervorlage_am: string | null;
    }[]) {
      const d = p.datum?.slice(0, 10);
      if (d && d >= gridStart && d <= gridEnd) {
        eintraege.push({ datum: d, art: "eins_zu_eins", titel: p.thema || "1:1-Meeting", uhrzeit: p.uhrzeit, href: `/team/${p.leitung_id}` });
      }
      const wv = p.wiedervorlage_am?.slice(0, 10);
      if (wv && wv >= gridStart && wv <= gridEnd) {
        eintraege.push({ datum: wv, art: "wiedervorlage", titel: `WV: ${p.thema || "Protokoll"}`, href: `/team/${p.leitung_id}` });
      }
    }
  }

  // 2) SL-Meetings.
  {
    let data: unknown[] | null = null;
    if (targetLeitung) {
      const res = await supabase
        .from("sl_meetings")
        .select("id, datum, uhrzeit, titel, sl_meeting_teilnehmer!inner(leitung_id)")
        .eq("sl_meeting_teilnehmer.leitung_id", targetLeitung)
        .gte("datum", gridStart).lte("datum", gridEnd);
      data = res.data;
    } else {
      const res = await supabase.from("sl_meetings").select("id, datum, uhrzeit, titel").gte("datum", gridStart).lte("datum", gridEnd);
      data = res.data;
    }
    for (const m of (data ?? []) as { id: string; datum: string; uhrzeit: string | null; titel: string }[]) {
      eintraege.push({
        datum: m.datum.slice(0, 10), art: "sl_meeting", titel: m.titel, uhrzeit: m.uhrzeit,
        href: admin ? "/admin/sl-meetings" : null,
      });
    }
  }

  // 3) Vor-Ort-Termine (anrufe typ='vor_ort').
  {
    let q = supabase
      .from("anrufe")
      .select("id, datum, schule_id, schule:schule_id(name)")
      .eq("typ", "vor_ort")
      .gte("datum", `${gridStart}T00:00:00`).lte("datum", `${gridEnd}T23:59:59`);
    if (targetLeitung) q = q.eq("leitung_id", targetLeitung);
    const { data } = await q;
    for (const a of (data ?? []) as unknown as { id: string; datum: string; schule_id: string; schule: { name: string } | null }[]) {
      eintraege.push({ datum: a.datum.slice(0, 10), art: "vor_ort", titel: a.schule?.name || "Vor-Ort-Termin", href: `/schule/${a.schule_id}` });
    }
  }

  // 4) Schul-Wiedervorlagen.
  {
    let q = supabase.from("schulen").select("id, name, wiedervorlage_am, standort_id")
      .gte("wiedervorlage_am", gridStart).lte("wiedervorlage_am", gridEnd);
    if (standortIds) q = standortIds.length ? q.in("standort_id", standortIds) : q.eq("standort_id", "00000000-0000-0000-0000-000000000000");
    const { data } = await q;
    for (const s of (data ?? []) as { id: string; name: string; wiedervorlage_am: string | null }[]) {
      const wv = s.wiedervorlage_am?.slice(0, 10);
      if (wv) eintraege.push({ datum: wv, art: "wiedervorlage", titel: `WV: ${s.name}`, href: `/schule/${s.id}` });
    }
  }

  return (
    <>
      <AppHeader leitung={me} />
      <KalenderClient
        view={view}
        gridStart={gridStart}
        gridEnd={gridEnd}
        title={title}
        monatPrefix={monatPrefix}
        prevRef={prevRef}
        nextRef={nextRef}
        heuteISO={todayISO()}
        eintraege={eintraege}
        admin={admin}
        sls={sls}
        selectedSl={admin ? targetLeitung : null}
      />
    </>
  );
}
