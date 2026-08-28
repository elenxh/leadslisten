"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { addDaysISO, WOCHENTAG_KURZ } from "@/lib/abrechnung";
import type { Leitung } from "@/lib/types";

export type KalArt = "eins_zu_eins" | "sl_meeting" | "vor_ort" | "wiedervorlage";

export interface KalEintrag {
  datum: string;
  art: KalArt;
  titel: string;
  href: string | null;
  uhrzeit?: string | null;
}

const ART_META: Record<KalArt, { label: string; dot: string; pill: string }> = {
  eins_zu_eins: {
    label: "1:1-Meeting",
    dot: "bg-purple-500",
    pill: "bg-purple-500/15 text-purple-700 dark:text-purple-300 hover:bg-purple-500/25",
  },
  sl_meeting: {
    label: "SL-Meeting",
    dot: "bg-indigo-500",
    pill: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/25",
  },
  vor_ort: {
    label: "Vor-Ort-Termin",
    dot: "bg-blue-500",
    pill: "bg-blue-500/15 text-blue-700 dark:text-blue-300 hover:bg-blue-500/25",
  },
  wiedervorlage: {
    label: "Wiedervorlage",
    dot: "bg-amber-500",
    pill: "bg-amber-500/15 text-amber-700 dark:text-amber-300 hover:bg-amber-500/25",
  },
};
const ALLE = "__alle__";

export function KalenderClient({
  view,
  gridStart,
  gridEnd,
  title,
  monatPrefix,
  prevRef,
  nextRef,
  heuteISO,
  eintraege,
  admin,
  sls,
  selectedSl,
}: {
  view: "monat" | "woche";
  gridStart: string;
  gridEnd: string;
  title: string;
  monatPrefix: string;
  prevRef: string;
  nextRef: string;
  heuteISO: string;
  eintraege: KalEintrag[];
  admin: boolean;
  sls: Pick<Leitung, "id" | "name">[];
  selectedSl: string | null;
}) {
  const router = useRouter();

  // href-Builder für Navigation (View/Ref/SL beibehalten).
  const url = (opts: { view?: string; ref?: string; sl?: string | null }) => {
    const v = opts.view ?? view;
    const r = opts.ref ?? "";
    const sl = opts.sl === undefined ? selectedSl : opts.sl;
    const params = new URLSearchParams();
    params.set("view", v);
    if (r) params.set("ref", r);
    if (sl) params.set("sl", sl);
    return `/kalender?${params.toString()}`;
  };

  // Tage des Gitters.
  const days: string[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDaysISO(d, 1)) days.push(d);
  const wochen: string[][] = [];
  for (let i = 0; i < days.length; i += 7) wochen.push(days.slice(i, i + 7));

  const byDay = new Map<string, KalEintrag[]>();
  for (const e of eintraege) {
    const arr = byDay.get(e.datum) ?? [];
    arr.push(e);
    byDay.set(e.datum, arr);
  }

  return (
    <main className="mx-auto max-w-5xl space-y-4 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" render={<Link href={url({ ref: prevRef })} />} aria-label="Zurück">
            <ChevronLeft className="size-4" />
          </Button>
          <h1 className="min-w-40 text-center text-lg font-semibold">{title}</h1>
          <Button variant="outline" size="icon" render={<Link href={url({ ref: nextRef })} />} aria-label="Weiter">
            <ChevronRight className="size-4" />
          </Button>
          <Button variant="ghost" size="sm" render={<Link href={url({ ref: heuteISO })} />}>
            Heute
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {admin && sls.length > 0 && (
            <Select
              value={selectedSl ?? ALLE}
              onValueChange={(v) => router.push(url({ sl: v === ALLE ? null : (v as string) }))}
            >
              <SelectTrigger className="w-44" data-testid="sl-filter">
                <SelectValue>
                  {(v: string) => (v && v !== ALLE ? sls.find((s) => s.id === v)?.name ?? "SL" : "Alle SLs")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALLE}>Alle SLs</SelectItem>
                {sls.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="inline-flex overflow-hidden rounded-md border">
            <Link href={url({ view: "monat" })} className={cn("px-3 py-1.5 text-sm", view === "monat" ? "bg-primary text-primary-foreground" : "hover:bg-muted")} data-testid="view-monat">Monat</Link>
            <Link href={url({ view: "woche" })} className={cn("px-3 py-1.5 text-sm", view === "woche" ? "bg-primary text-primary-foreground" : "hover:bg-muted")} data-testid="view-woche">Woche</Link>
          </div>
        </div>
      </div>

      {/* Legende */}
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground" data-testid="legende">
        {(Object.keys(ART_META) as KalArt[]).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className={cn("size-2.5 rounded-full", ART_META[k].dot)} />
            {ART_META[k].label}
          </span>
        ))}
      </div>

      {/* Wochentag-Kopf */}
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground">
        {WOCHENTAG_KURZ.map((w) => <div key={w}>{w}</div>)}
      </div>

      {/* Gitter */}
      <div className="space-y-1">
        {wochen.map((woche, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-1">
            {woche.map((d) => {
              const inMonat = view === "woche" || d.slice(0, 7) === monatPrefix;
              const eintr = byDay.get(d) ?? [];
              return (
                <div
                  key={d}
                  data-testid="kal-tag"
                  className={cn(
                    "min-h-24 rounded-md border p-1",
                    inMonat ? "bg-card" : "bg-muted/30 text-muted-foreground",
                    d === heuteISO && "ring-2 ring-primary",
                  )}
                >
                  <div className="mb-1 px-0.5 text-right text-xs text-muted-foreground">{Number(d.slice(8))}</div>
                  <div className="space-y-0.5">
                    {eintr.map((e, i) => {
                      const inner = (
                        <span className="block truncate">
                          {e.uhrzeit ? `${e.uhrzeit} ` : ""}{e.titel}
                        </span>
                      );
                      const cls = cn("block rounded px-1 py-0.5 text-[11px] leading-tight", ART_META[e.art].pill);
                      return e.href ? (
                        <Link key={i} href={e.href} className={cls} data-testid="kal-eintrag">{inner}</Link>
                      ) : (
                        <span key={i} className={cls} data-testid="kal-eintrag">{inner}</span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </main>
  );
}
