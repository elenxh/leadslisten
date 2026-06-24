"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  Handshake,
  LayoutGrid,
  List,
  Loader2,
  MapPin,
  MessagesSquare,
  School,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { SchulTable } from "@/components/app/schul-table";
import { SelectCheckbox } from "@/components/app/select-checkbox";
import {
  bulkSetSchulenLeitung,
  bulkSetSchulenStandort,
} from "@/app/standorte/actions";
import { cn } from "@/lib/utils";
import {
  StandortSidebar,
  STANDORT_ALLE,
  STANDORT_OHNE,
  type SidebarData,
} from "@/components/app/standort-sidebar";
import { createClient } from "@/lib/supabase/client";
import { STATUS_LIST } from "@/lib/status";
import { RING_OPTIONS, ringLabel } from "@/lib/berlin-ring";
import { isDueThisWeek, isDueToday, isOverdue } from "@/lib/dates";
import type {
  Leitung,
  SchuleMitLeitung,
  Standort,
  StandortMitVorschlag,
} from "@/lib/types";

type TabKey = "meine" | "faellig" | "woche" | "koop" | "alle";
type ViewMode = "kachel" | "liste";

const VIEW_STORAGE_KEY = "leadslisten:schul-view";

export function DashboardClient({
  schulen,
  me,
  standorte,
  vorgeschlagen,
  leitungen,
}: {
  schulen: SchuleMitLeitung[];
  me: Leitung;
  standorte: Standort[];
  vorgeschlagen: StandortMitVorschlag[];
  leitungen: Pick<Leitung, "id" | "name">[];
}) {
  const router = useRouter();
  const admin = me.rolle === "admin";

  const [tab, setTab] = useState<TabKey>(admin ? "alle" : "meine");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [ringFilter, setRingFilter] = useState<string>("all");
  const [standortFilter, setStandortFilter] = useState<string>(STANDORT_ALLE);
  const [search, setSearch] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // Standard: Kachel. Beim Mount aus localStorage übernehmen (vermeidet
  // SSR-Hydration-Mismatch).
  const [view, setView] = useState<ViewMode>("kachel");

  useEffect(() => {
    const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
    if (stored === "kachel" || stored === "liste") setView(stored);
  }, []);

  function changeView(next: ViewMode) {
    setView(next);
    window.localStorage.setItem(VIEW_STORAGE_KEY, next);
  }

  // Massen-Auswahl (nur Admin)
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStandort, setBulkStandort] = useState<string>("");
  const [bulkLeitung, setBulkLeitung] = useState<string>("");
  const [bulkPending, startBulk] = useTransition();

  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

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

  // Schulzahlen je Standort (für die Seitenleiste).
  const sidebarData: SidebarData = useMemo(() => {
    const counts: Record<string, number> = {};
    let ohneCount = 0;
    for (const s of schulen) {
      if (s.standort_id) counts[s.standort_id] = (counts[s.standort_id] ?? 0) + 1;
      else ohneCount++;
    }
    return {
      standorte,
      vorgeschlagen,
      counts,
      ohneCount,
      total: schulen.length,
    };
  }, [schulen, standorte, vorgeschlagen]);

  const activeStandortName = useMemo(() => {
    if (standortFilter === STANDORT_ALLE) return null;
    if (standortFilter === STANDORT_OHNE) return "Ohne Standort";
    return standorte.find((s) => s.id === standortFilter)?.name ?? null;
  }, [standortFilter, standorte]);

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
      .filter((s) => {
        if (standortFilter === STANDORT_ALLE) return true;
        if (standortFilter === STANDORT_OHNE) return s.standort_id == null;
        return s.standort_id === standortFilter;
      })
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
  }, [tabbed, standortFilter, statusFilter, ringFilter, search]);

  // Auswahl-Status bezogen auf die aktuell gefilterten Schulen.
  const allFilteredSelected =
    filtered.length > 0 && filtered.every((s) => selected.has(s.id));
  const someFilteredSelected =
    !allFilteredSelected && filtered.some((s) => selected.has(s.id));

  function toggleAllFiltered(checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const s of filtered) {
        if (checked) next.add(s.id);
        else next.delete(s.id);
      }
      return next;
    });
  }

  function runBulkStandort() {
    if (!bulkStandort) {
      toast.error("Bitte einen Standort wählen.");
      return;
    }
    const ids = Array.from(selected);
    const name =
      standorte.find((s) => s.id === bulkStandort)?.name ?? "Standort";
    startBulk(async () => {
      const res = await bulkSetSchulenStandort(ids, bulkStandort);
      if (!res.ok) {
        toast.error("Zuweisung fehlgeschlagen", { description: res.error });
        return;
      }
      toast.success(
        `${res.count} ${res.count === 1 ? "Schule" : "Schulen"} Standort „${name}" zugewiesen`,
      );
      clearSelection();
      setBulkStandort("");
      router.refresh();
    });
  }

  function runBulkLeitung() {
    if (!bulkLeitung) {
      toast.error("Bitte eine Leitung wählen.");
      return;
    }
    const ids = Array.from(selected);
    const name = leitungen.find((l) => l.id === bulkLeitung)?.name ?? "Leitung";
    startBulk(async () => {
      const res = await bulkSetSchulenLeitung(ids, bulkLeitung);
      if (!res.ok) {
        toast.error("Zuweisung fehlgeschlagen", { description: res.error });
        return;
      }
      toast.success(
        `${res.count} ${res.count === 1 ? "Schule" : "Schulen"} ${name} zugewiesen`,
      );
      clearSelection();
      setBulkLeitung("");
      router.refresh();
    });
  }

  return (
    <div className="mx-auto flex max-w-6xl gap-6 px-4 py-5">
      {/* Sidebar – Desktop */}
      <aside className="hidden w-56 shrink-0 lg:block">
        <div className="sticky top-20">
          <StandortSidebar
            data={sidebarData}
            value={standortFilter}
            onChange={setStandortFilter}
            isAdmin={admin}
            leitungen={leitungen}
          />
        </div>
      </aside>

      <div
        className={cn(
          "min-w-0 flex-1 space-y-5",
          admin && selected.size > 0 && "pb-28",
        )}
      >
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

        {/* Standort-Auswahl – Mobile */}
        <div className="lg:hidden">
          <Dialog open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <DialogTrigger
              render={
                <Button variant="outline" className="w-full justify-start" />
              }
            >
              <MapPin className="mr-2 size-4" />
              {activeStandortName ?? "Alle Standorte"}
            </DialogTrigger>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Standorte</DialogTitle>
              </DialogHeader>
              <StandortSidebar
                data={sidebarData}
                value={standortFilter}
                onChange={(v) => {
                  setStandortFilter(v);
                  setMobileNavOpen(false);
                }}
                isAdmin={admin}
                leitungen={leitungen}
              />
            </DialogContent>
          </Dialog>
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
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {admin && (
            <label className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-muted-foreground sm:py-0 sm:h-9">
              <SelectCheckbox
                checked={allFilteredSelected}
                indeterminate={someFilteredSelected}
                onCheckedChange={toggleAllFiltered}
                label="Alle sichtbaren Schulen auswählen"
              />
              <span className="whitespace-nowrap">Alle</span>
            </label>
          )}
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

            {/* Ansicht umschalten: Kachel / Liste */}
            <div className="inline-flex shrink-0 items-center rounded-lg border p-0.5">
              <button
                type="button"
                onClick={() => changeView("kachel")}
                aria-label="Kachelansicht"
                aria-pressed={view === "kachel"}
                title="Kacheln"
                className={cn(
                  "rounded-md p-1.5 transition-colors",
                  view === "kachel"
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <LayoutGrid className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => changeView("liste")}
                aria-label="Listenansicht"
                aria-pressed={view === "liste"}
                title="Liste"
                className={cn(
                  "rounded-md p-1.5 transition-colors",
                  view === "liste"
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <List className="size-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Liste */}
        <div>
          <p className="mb-2 text-sm text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? "Schule" : "Schulen"}
            {activeStandortName && (
              <> · {activeStandortName}</>
            )}
          </p>
          {filtered.length === 0 ? (
            <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
              Keine Schulen in dieser Ansicht.
            </div>
          ) : view === "liste" ? (
            <SchulTable
              schulen={filtered}
              showLeitung={admin}
              selectable={admin}
              selectedIds={selected}
              onToggle={toggleOne}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {filtered.map((s) => (
                <SchulCard
                  key={s.id}
                  schule={s}
                  showLeitung={admin}
                  selectable={admin}
                  selected={selected.has(s.id)}
                  onToggle={(c) => toggleOne(s.id, c)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Schwebende Massen-Aktionsleiste (nur Admin, bei Auswahl) */}
      {admin && selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-3">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-2 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur sm:gap-3">
            <span className="text-sm font-medium">
              {selected.size}{" "}
              {selected.size === 1 ? "Schule" : "Schulen"} ausgewählt
            </span>

            <div className="flex flex-1 flex-wrap items-center gap-2">
              {/* Standort zuweisen */}
              <div className="flex items-center gap-1">
                <Select
                  value={bulkStandort}
                  onValueChange={(v) => setBulkStandort((v as string) ?? "")}
                >
                  <SelectTrigger className="h-9 w-40">
                    <SelectValue placeholder="Standort zuweisen…" />
                  </SelectTrigger>
                  <SelectContent>
                    {standorte.length === 0 ? (
                      <SelectItem value="__none__" disabled>
                        Keine Standorte
                      </SelectItem>
                    ) : (
                      standorte.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  onClick={runBulkStandort}
                  disabled={bulkPending || !bulkStandort}
                >
                  {bulkPending && (
                    <Loader2 className="mr-1.5 size-4 animate-spin" />
                  )}
                  Zuweisen
                </Button>
              </div>

              {/* Leitung zuweisen */}
              <div className="flex items-center gap-1">
                <Select
                  value={bulkLeitung}
                  onValueChange={(v) => setBulkLeitung((v as string) ?? "")}
                >
                  <SelectTrigger className="h-9 w-40">
                    <SelectValue placeholder="Leitung zuweisen…" />
                  </SelectTrigger>
                  <SelectContent>
                    {leitungen.length === 0 ? (
                      <SelectItem value="__none__" disabled>
                        Keine Leitungen
                      </SelectItem>
                    ) : (
                      leitungen.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={runBulkLeitung}
                  disabled={bulkPending || !bulkLeitung}
                >
                  Zuweisen
                </Button>
              </div>
            </div>

            <Button
              size="sm"
              variant="ghost"
              onClick={clearSelection}
              disabled={bulkPending}
              title="Auswahl aufheben"
            >
              <X className="size-4 sm:mr-1.5" />
              <span className="hidden sm:inline">Aufheben</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
