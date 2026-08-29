"use client";

import { useEffect } from "react";
import { CalendarDays, Clock, ExternalLink, Link2, Video } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/dates";

export interface SLMeetingItem {
  id: string;
  datum: string; // YYYY-MM-DD
  uhrzeit: string | null;
  dauer_minuten: number;
  titel: string;
  call_link: string | null;
  notizen: string | null;
  neu: boolean;
}

export interface RessourcenLinkItem {
  id: string;
  titel: string;
  url: string;
  beschreibung: string | null;
}

export function SLMeetingsView({
  meetings,
  links,
}: {
  meetings: SLMeetingItem[];
  links: RessourcenLinkItem[];
}) {
  // Beim Öffnen als gelesen markieren (leert den Ungelesen-Badge im Header).
  useEffect(() => {
    let abgebrochen = false;
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || abgebrochen) return;
      await supabase
        .from("sl_meeting_ansicht")
        .upsert({ leitung_id: user.id, gesehen_am: new Date().toISOString() });
    })();
    return () => {
      abgebrochen = true;
    };
  }, []);

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-6">
      {links.length > 0 && (
        <div className="rounded-lg border bg-card p-4" data-testid="wichtige-links">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <Link2 className="size-4 text-primary" />
            Wichtige Links
          </div>
          <ul className="space-y-2">
            {links.map((l) => (
              <li key={l.id}>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-start gap-2 rounded-md border bg-background px-3 py-2 transition-colors hover:bg-muted/60"
                  data-testid="wichtiger-link"
                >
                  <ExternalLink className="mt-0.5 size-4 shrink-0 text-muted-foreground group-hover:text-primary" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium group-hover:text-primary">{l.titel}</span>
                    {l.beschreibung && (
                      <span className="block text-xs text-muted-foreground">{l.beschreibung}</span>
                    )}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h1 className="text-xl font-semibold">SL-Meetings</h1>
        <p className="text-sm text-muted-foreground">
          Deine Meetings — kommende zuerst. Call-Link und Notizen pflegt Elena.
        </p>
      </div>

      {meetings.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch keine SL-Meetings.</p>
      ) : (
        <div className="space-y-2">
          {meetings.map((m) => (
            <Card key={m.id} data-testid="sl-meeting-item">
              <CardContent className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      {m.titel}
                      {m.neu && (
                        <span
                          className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground"
                          data-testid="sl-meeting-neu"
                        >
                          Neu
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="size-3.5" />
                        {formatDate(m.datum)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="size-3.5" />
                        {m.uhrzeit ? `${m.uhrzeit} · ` : ""}
                        {m.dauer_minuten} min
                      </span>
                    </p>
                  </div>
                  {m.call_link && (
                    <Button
                      size="sm"
                      className="shrink-0"
                      data-testid="sl-meeting-link"
                      render={
                        <a href={m.call_link} target="_blank" rel="noopener noreferrer" />
                      }
                    >
                      <Video className="mr-1.5 size-4" />
                      Zum Call
                      <ExternalLink className="ml-1.5 size-3.5" />
                    </Button>
                  )}
                </div>
                {m.notizen && (
                  <p className="whitespace-pre-wrap rounded-md bg-muted/50 px-3 py-2 text-sm">
                    {m.notizen}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
