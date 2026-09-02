import "server-only";

import type { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/dates";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export interface OffeneAufgabe {
  id: string;
  was: string;
  bis_wann: string;
  typ: "einzel" | "gemeinsam";
}

// Offene Aufgaben EINER Person: einzel (ihr zugewiesen, nicht erledigt) +
// gemeinsam (noch nicht von ihr abgehakt). Nutzt den übergebenen (RLS-)Client.
export async function ladeOffeneAufgabenFuer(
  supabase: ServerClient,
  leitungId: string,
  mitGemeinsam = true,
): Promise<OffeneAufgabe[]> {
  const [{ data: einzel }, { data: gemeinsam }, { data: meineErledigung }] =
    await Promise.all([
      supabase
        .from("aufgaben")
        .select("id, was, bis_wann")
        .eq("typ", "einzel")
        .eq("zugewiesen_an", leitungId)
        .eq("erledigt", false),
      mitGemeinsam
        ? supabase.from("aufgaben").select("id, was, bis_wann").eq("typ", "gemeinsam")
        : Promise.resolve({ data: [] as { id: string; was: string; bis_wann: string }[] }),
      supabase
        .from("aufgabe_erledigung")
        .select("aufgabe_id, erledigt")
        .eq("leitung_id", leitungId),
    ]);

  const erledigtSet = new Set(
    ((meineErledigung ?? []) as { aufgabe_id: string; erledigt: boolean }[])
      .filter((r) => r.erledigt)
      .map((r) => r.aufgabe_id),
  );

  const out: OffeneAufgabe[] = [];
  for (const a of (einzel ?? []) as { id: string; was: string; bis_wann: string }[]) {
    out.push({ ...a, typ: "einzel" });
  }
  for (const a of (gemeinsam ?? []) as { id: string; was: string; bis_wann: string }[]) {
    if (!erledigtSet.has(a.id)) out.push({ ...a, typ: "gemeinsam" });
  }
  out.sort((x, y) => x.bis_wann.localeCompare(y.bis_wann));
  return out;
}

export interface AufgabenUebersichtZeile {
  offen: number;
  ueberfaellig: number;
}

// Admin-Übersicht: offene/überfällige Aufgaben je SL (einzel + gemeinsam).
export async function ladeAufgabenUebersicht(
  supabase: ServerClient,
  leitungIds: string[],
): Promise<Map<string, AufgabenUebersichtZeile>> {
  const heute = todayISO();
  const map = new Map<string, AufgabenUebersichtZeile>();
  const bump = (id: string, ueberfaellig: boolean) => {
    const e = map.get(id) ?? { offen: 0, ueberfaellig: 0 };
    e.offen += 1;
    if (ueberfaellig) e.ueberfaellig += 1;
    map.set(id, e);
  };

  const [{ data: einzel }, { data: gemeinsam }, { data: erledigungen }] =
    await Promise.all([
      supabase
        .from("aufgaben")
        .select("zugewiesen_an, bis_wann")
        .eq("typ", "einzel")
        .eq("erledigt", false),
      supabase.from("aufgaben").select("id, bis_wann").eq("typ", "gemeinsam"),
      supabase.from("aufgabe_erledigung").select("aufgabe_id, leitung_id, erledigt"),
    ]);

  for (const a of (einzel ?? []) as { zugewiesen_an: string | null; bis_wann: string }[]) {
    if (a.zugewiesen_an) bump(a.zugewiesen_an, a.bis_wann.slice(0, 10) < heute);
  }

  // Gemeinsam: für jede SL offen, sofern keine erledigt=true-Zeile existiert.
  const doneBy = new Map<string, Set<string>>(); // aufgabe_id -> Set<leitung_id>
  for (const e of (erledigungen ?? []) as {
    aufgabe_id: string;
    leitung_id: string;
    erledigt: boolean;
  }[]) {
    if (!e.erledigt) continue;
    let set = doneBy.get(e.aufgabe_id);
    if (!set) {
      set = new Set<string>();
      doneBy.set(e.aufgabe_id, set);
    }
    set.add(e.leitung_id);
  }
  for (const g of (gemeinsam ?? []) as { id: string; bis_wann: string }[]) {
    const done = doneBy.get(g.id) ?? new Set<string>();
    const ueberfaellig = g.bis_wann.slice(0, 10) < heute;
    for (const lid of leitungIds) {
      if (!done.has(lid)) bump(lid, ueberfaellig);
    }
  }

  return map;
}
