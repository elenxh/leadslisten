"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  Handshake,
  MessagesSquare,
  School,
  Search,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatCard } from "@/components/app/stat-card";
import { SchulCard } from "@/components/app/schul-card";
import { createClient } from "@/lib/supabase/client";
import { STATUS_LIST } from "@/lib/status";
import { RING_OPTIONS, ringLabel } from "@/lib/berlin-ring";
import { isDueThisWeek, isDueToday, isOverdue } from "@/lib/dates";
import type { Leitung, SchuleMitLeitung } from "@/lib/types";

type TabKey = "meine" | "faellig" | "woche" | "koop" | "alle";

export function DashboardClient({
  schulen,
  me,
}: {
  schulen: SchuleMitLeitung[];
  me: Leitung;
}) {
  const router = useRouter();
  const admin = me.rolle === "admin";

  const [tab, setTab] = useState<TabKey>(admin ? "alle" : "meine");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [ringFilter, setRingFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  // Realtime: refresh server data on any change to schulen.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("schulen-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "schulen" },
        () => router.refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  const mine = useMemo(
    () => schulen.filter((s) => s.zustaendig === me.id),
    [schulen, me.id],
  );

  // Stat scope: a Leitung sees their own numbers; the admin sees the total.
  const statScope = admin ? schulen : mine;
  const stats = useMemo(() => {
    return {
      mine: statScope.length,
      faellig: statScope.filter(
        (s) => isDueToday(s.naechster_anruf) || isOverdue(s.naechster_anruf),
      ).length,
      gespraech: statScope.filter((s) => s.status === "gespraech").length,
      koop: statScope.filter((s) => s.status === "koop").length,
    };
  }, [statScope]);

  const tabbed = useMemo(() => {
    switch (tab) {
      case "meine":
        return mine;
      case "faellig":
        return schulen.filter(
          (s) => isDueToday(s.naechster_anruf) || isOverdue(s.naechster_anruf),
        );
      case "woche":
        return schulen.filter((s) => isDueThisWeek(s.naechster_anruf));
      case "koop":
        return schulen.filter((s) => s.status === "koop");
      case "alle":
      default:
        return schulen;
    }
  }, [tab, mine, schulen]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tabbed
      .filter((s) => statusFilter === "all" || s.status === statusFilter)
      .filter((s) => ringFilter === "all" || String(s.ring) === ringFilter)
      .filter((s) => {
        if (!q) return true;
        return (
          s.name.toLowerCase().includes(q) ||
          (s.stadt ?? "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        // Overdue/today first, then by next-call date, then name.
        const da = a.naechster_anruf ?? "9999";
        const db = b.naechster_anruf ?? "9999";
        if (da !== db) return da < db ? -1 : 1;
        return a.name.localeCompare(b.name, "de");
      });
  }, [tabbed, statusFilter, ringFilter, search]);

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-5">
      {/* Statistik-Kacheln */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label={admin ? "Schulen gesamt" : "Meine Schulen"}
          value={stats.mine}
          icon={School}
          accent="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
          active={tab === (admin ? "alle" : "meine")}
          onClick={() => setTab(admin ? "alle" : "meine")}
        />
        <StatCard
          label="Heute fällig"
          value={stats.faellig}
          icon={CalendarClock}
          accent="bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-200"
          active={tab === "faellig"}
          onClick={() => setTab("faellig")}
        />
        <StatCard
          label="In Gespräch"
          value={stats.gespraech}
          icon={MessagesSquare}
          accent="bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-200"
        />
        <StatCard
          label="Kooperationen"
          value={stats.koop}
          icon={Handshake}
          accent="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200"
          active={tab === "koop"}
          onClick={() => setTab("koop")}
        />
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <TabsList className="flex w-full flex-wrap">
          <TabsTrigger value="meine">Meine</TabsTrigger>
          <TabsTrigger value="faellig">Heute fällig</TabsTrigger>
          <TabsTrigger value="woche">Diese Woche</TabsTrigger>
          <TabsTrigger value="koop">Kooperationen</TabsTrigger>
          <TabsTrigger value="alle">Alle</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Filter */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Schule oder Stadt suchen…"
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter((v as string) ?? "all")}>
            <SelectTrigger className="w-full min-w-32 sm:w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Status</SelectItem>
              {STATUS_LIST.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={ringFilter} onValueChange={(v) => setRingFilter((v as string) ?? "all")}>
            <SelectTrigger className="w-full min-w-24 sm:w-32">
              <SelectValue placeholder="Ring" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Ringe</SelectItem>
              {RING_OPTIONS.map((r) => (
                <SelectItem key={r} value={String(r)}>
                  {ringLabel(r)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Liste */}
      <div>
        <p className="mb-2 text-sm text-muted-foreground">
          {filtered.length} {filtered.length === 1 ? "Schule" : "Schulen"}
        </p>
        {filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
            Keine Schulen in dieser Ansicht.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {filtered.map((s) => (
              <SchulCard key={s.id} schule={s} showLeitung={admin} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
