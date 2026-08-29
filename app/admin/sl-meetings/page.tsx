import { redirect } from "next/navigation";

import { AppHeader } from "@/components/app/app-header";
import { isAdmin, requireLeitung } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Leitung, RessourcenLink, SLMeeting } from "@/lib/types";
import { SLMeetingsClient } from "./sl-meetings-client";

export const dynamic = "force-dynamic";

export type MeetingMitTeilnehmer = SLMeeting & { teilnehmer: string[] };

export default async function SLMeetingsPage() {
  const me = await requireLeitung();
  if (!isAdmin(me)) redirect("/dashboard");

  const supabase = await createClient();
  const [{ data: sls }, { data: meetingsData }, { data: linksData }] = await Promise.all([
    supabase
      .from("leitungen")
      .select("id, name, kuerzel, farbe")
      .eq("rolle", "leitung")
      .eq("aktiv", true)
      .order("name"),
    supabase
      .from("sl_meetings")
      .select("*, teilnehmer:sl_meeting_teilnehmer(leitung_id)")
      .order("datum", { ascending: false }),
    supabase
      .from("ressourcen_links")
      .select("*")
      .order("sortierung", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  type Row = SLMeeting & { teilnehmer: { leitung_id: string }[] };
  const meetings: MeetingMitTeilnehmer[] = ((meetingsData ?? []) as unknown as Row[]).map((m) => ({
    ...m,
    teilnehmer: (m.teilnehmer ?? []).map((t) => t.leitung_id),
  }));

  return (
    <>
      <AppHeader leitung={me} />
      <SLMeetingsClient
        sls={(sls ?? []) as Pick<Leitung, "id" | "name" | "kuerzel" | "farbe">[]}
        meetings={meetings}
        ressourcenLinks={(linksData ?? []) as RessourcenLink[]}
      />
    </>
  );
}
