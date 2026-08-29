import { AppHeader } from "@/components/app/app-header";
import { requireLeitung } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/dates";
import type { SLMeeting } from "@/lib/types";
import { SLMeetingsView, type SLMeetingItem } from "./sl-meetings-view";

export const dynamic = "force-dynamic";

export default async function SLMeetingsSLPage() {
  const me = await requireLeitung();
  const supabase = await createClient();

  const [{ data: meetingsData }, { data: ansicht }] = await Promise.all([
    supabase
      .from("sl_meetings")
      .select(
        "id, datum, uhrzeit, dauer_minuten, titel, call_link, notizen, created_at, updated_at, sl_meeting_teilnehmer!inner(leitung_id)",
      )
      .eq("sl_meeting_teilnehmer.leitung_id", me.id)
      .order("datum", { ascending: true }),
    supabase
      .from("sl_meeting_ansicht")
      .select("gesehen_am")
      .eq("leitung_id", me.id)
      .maybeSingle(),
  ]);

  const seen = (ansicht as { gesehen_am: string } | null)?.gesehen_am ?? "";
  const alle: SLMeetingItem[] = ((meetingsData ?? []) as unknown as SLMeeting[]).map((m) => ({
    id: m.id,
    datum: m.datum.slice(0, 10),
    uhrzeit: m.uhrzeit,
    dauer_minuten: m.dauer_minuten,
    titel: m.titel,
    call_link: m.call_link,
    notizen: m.notizen,
    neu: !seen || m.created_at > seen || m.updated_at > seen,
  }));

  // Kommende zuerst (aufsteigend), danach vergangene (absteigend).
  const heute = todayISO();
  const kommend = alle.filter((m) => m.datum >= heute);
  const vergangen = alle.filter((m) => m.datum < heute).reverse();
  const meetings = [...kommend, ...vergangen];

  return (
    <>
      <AppHeader leitung={me} />
      <SLMeetingsView meetings={meetings} />
    </>
  );
}
