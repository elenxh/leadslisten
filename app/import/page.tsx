import { redirect } from "next/navigation";

import { AppHeader } from "@/components/app/app-header";
import { isAdmin, requireLeitung } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { IMPORT_FUER_SL } from "@/lib/features";
import type { Standort } from "@/lib/types";
import { TutorioImportClient } from "./import-client";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const me = await requireLeitung();

  // Import vorerst nur für Admins (Flag IMPORT_FUER_SL). SLs, die die Route
  // direkt aufrufen, werden aufs Dashboard umgeleitet.
  if (!IMPORT_FUER_SL && !isAdmin(me)) {
    redirect("/dashboard");
  }

  const supabase = await createClient();

  // Standorte scopen: Admin alle aktiven, SL nur die zugeordneten (aktiven).
  let standorte: Standort[] = [];
  if (isAdmin(me)) {
    const { data } = await supabase
      .from("standorte")
      .select("*")
      .eq("status", "aktiv")
      .order("name");
    standorte = (data ?? []) as Standort[];
  } else {
    const { data } = await supabase
      .from("leitung_standort")
      .select("standort:standort_id(*)")
      .eq("leitung_id", me.id);
    standorte = ((data ?? []) as unknown as { standort: Standort | null }[])
      .map((r) => r.standort)
      .filter((s): s is Standort => !!s && s.status === "aktiv")
      .sort((a, b) => a.name.localeCompare(b.name, "de"));
  }

  return (
    <>
      <AppHeader leitung={me} />
      <TutorioImportClient standorte={standorte} />
    </>
  );
}
