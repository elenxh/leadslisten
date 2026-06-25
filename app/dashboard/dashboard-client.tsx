"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
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
import { FarbLegendeDialog } from "@/components/app/farb-legende-dialog";
import { NeueSchuleDialog } from "@/components/app/neue-schule-dialog";
import {
  bulkSetSchulenLeitung,
  bulkSetSchulenStandort,
} from "@/app/standorte/actions";
import { MARKIERUNG_FARBEN } from "@/lib/markierung";
import { cn } from "@/lib/utils";
import {
  StandortSidebar,
  STANDORT_ALLE,
  STANDORT_OHNE,
  type SidebarData,
} from "@/components/app/standort-sidebar";
import { createClient } from "@/lib/supabase/client";
import { writeSchulOrder } from "@/lib/schul-order";
import { STATUS_LIST } from "@/lib/status";
import {
  SCHULART_KATEGORIEN,
  schulartKategorie,
  istTraegerSchulart,
  type SchulartKategorie,
} from "@/lib/schulart";
import { RING_OPTIONS, ringLabel } from "@/lib/berlin-ring";
import { isDueThisWeek, isDueToday, isOverdue } from "@/lib/dates";
import { ampelInfo } from "@/lib/ampel";
import type {
  FarbLegende,
  Leitung,
  SchuleMitLeitung,
  Standort,
  StandortMitVorschlag,
} from "@/lib/types";

type LegendeRow = Pick<FarbLegende, "standort_id" | "farbe" | "bezeichnung">;

type TabKey =
  | "meine"
  | "faellig"
  | "woche"
  | "wiedervorlage"
  | "erledigt"
  | "alle";
type ViewMode = "kachel" | "liste";
type Bereich = "schule" | "traeger";

const VIEW_STORAGE_KEY = "leadslisten:schul-view";

// Diese Status gelten als erledigt: aus der aktiven Liste/Zählung ausblenden.
const ERLEDIGT_STATUS: readonly string[] = [
  "Kooperationsabschluss",
  "Kein Interesse",
];
const istErledigt = (s: SchuleMitLeitung) =>
  ERLEDIGT_STATUS.includes(s.status);

// Ort für den Bezirks-Filter: bevorzugt Bezirk, sonst Stadt.
const ortVon = (s: SchuleMitLeitung): string =>
  (s.bezirk ?? s.stadt ?? "").trim();

type SortKey = "kontakt_alt" | "kontakt_neu" | "name" | "bezirk";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "kontakt_alt", label: "Letzter Kontakt: älteste zuerst" },
  { value: "kontakt_neu", label: "Letzter Kontakt: neueste zuerst" },
  { value: "name", label: "Name A–Z" },
  { value: "bezirk", label: "Bezirk A–Z" },
];

// Vergleicht zwei Schulen anhand der gewählten Sortierung. "Letzter Kontakt"
// nutzt dasselbe Referenzdatum wie die Ampel (tage seit max. gültigem Datum);
// "kein Kontakt" (tage null) kommt immer ans Ende.
function compareSchulen(
  a: SchuleMitLeitung,
  b: SchuleMitLeitung,
  sortBy: SortKey,
): number {
  const byName = () => a.name.localeCompare(b.name, "de");

  if (sortBy === "name") return byName();

  if (sortBy === "bezirk") {
    const oa = ortVon(a);
    const ob = ortVon(b);
    if (oa === ob) return byName();
    if (!oa) return 1;
    if (!ob) return -1;
    return oa.localeCompare(ob, "de") || byName();
  }

  // kontakt_alt / kontakt_neu
  const ta = ampelInfo(a.erstkontakt_am, a.wiedervorlage_am, a.letzter_anruf_am).tage;
  const tb = ampelInfo(b.erstkontakt_am, b.wiedervorlage_am, b.letzter_anruf_am).tage;
  if (ta == null && tb == null) return byName();
  if (ta == null) return 1; // ohne gültiges Datum ans Ende
  if (tb == null) return -1;
  if (ta !== tb) return sortBy === "kontakt_alt" ? tb - ta : ta - tb;
  return byName();
}

export function DashboardClient({
  schulen,
  me,
  standorte,
  vorgeschlagen,
  leitungen,
  farbLegende,
}: {
  schulen: SchuleMitLeitung[];
  me: Leitung;
  standorte: Standort[];
  vorgeschlagen: StandortMitVorschlag[];
  leitungen: Pick<Leitung, "id" | "name">[];
  farbLegende: LegendeRow[];
}) {
  const router = useRouter();
  const admin = me.rolle === "admin";

  const [bereich, setBereich] = useState<Bereich>("schule");
  const [tab, setTab] = useState<TabKey>(admin ? "alle" : "meine");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [ringFilter, setRingFilter] = useState<string>("all");
  const [standortFilter, setStandortFilter] = useState<string>(STANDORT_ALLE);
  const [schulartFilter, setSchulartFilter] = useState<SchulartKategorie | "all">(
    "all",
  );
  const [markFilter, setMarkFilter] = useState<string>("all");
  const [bezirkFilter, setBezirkFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortKey>("kontakt_alt");
  const [search, setSearch] = useState("");

  // Standorte, die der aktuelle User bearbeiten darf (Markierung/Legende).
  const editableStandortIds = useMemo(
    () => new Set(standorte.map((s) => s.id)),
    [standorte],
  );

  // Gesamtzahl ALLER Einträge (Schulen + Träger, alle Status) je Standort –
  // für die "Standort leeren"-Bestätigung.
  const totalByStandort = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of schulen) {
      if (s.standort_id) m[s.standort_id] = (m[s.standort_id] ?? 0) + 1;
    }
    return m;
  }, [schulen]);

  // standort_id -> { farbe -> bezeichnung }
  const legendeByStandort = useMemo(() => {
    const m: Record<string, Record<string, string>> = {};
    for (const r of farbLegende) {
      (m[r.standort_id] ??= {})[r.farbe] = r.bezeichnung;
    }
    return m;
  }, [farbLegende]);
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

  function changeBereich(next: Bereich) {
    setBereich(next);
    setTab(admin ? "alle" : "meine");
    setSchulartFilter("all");
    setStandortFilter(STANDORT_ALLE);
    setBezirkFilter("all");
    clearSelection();
  }

  // Standortwahl: standort-spezifische Filter (Bezirk, Ring) zurücksetzen.
  function changeStandort(v: string) {
    setStandortFilter(v);
    setBezirkFilter("all");
    setRingFilter("all");
  }

  // Träger-Erkennung: primär typ, als Sicherheitsnetz auch die Schulart
  // (falls typ noch nicht gesetzt ist) -> Träger erscheinen NIE in der
  // Schulliste, sondern nur im Bereich "Soziale Träger".
  const istTraegerRow = (s: SchuleMitLeitung) =>
    s.typ === "traeger" || istTraegerSchulart(s.schulart);

  // Nur Einträge des aktuellen Bereichs (Schulen ODER Träger).
  const bereichSchulen = useMemo(
    () =>
      schulen.filter((s) =>
        bereich === "traeger" ? istTraegerRow(s) : !istTraegerRow(s),
      ),
    [schulen, bereich],
  );
  const nomen = bereich === "traeger" ? "Träger" : "Schulen";
  const nomenSg = bereich === "traeger" ? "Träger" : "Schule";

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
    () => bereichSchulen.filter((s) => s.zustaendig === me.id),
    [bereichSchulen, me.id],
  );

  // Standort-Scope: gleiche Logik wie die Liste (konkreter Standort / alle / ohne).
  const matchStandort = useCallback(
    (s: SchuleMitLeitung) => {
      if (standortFilter === STANDORT_ALLE) return true;
      if (standortFilter === STANDORT_OHNE) return s.standort_id == null;
      return s.standort_id === standortFilter;
    },
    [standortFilter],
  );

  // Stat scope: Leitung sieht ihre eigenen Zahlen, Admin alle – jeweils im
  // aktuell gewählten Standort (Kacheln folgen demselben Scope wie die Liste).
  const statScope = useMemo(
    () => (admin ? bereichSchulen : mine).filter(matchStandort),
    [admin, bereichSchulen, mine, matchStandort],
  );
  const stats = useMemo(() => {
    const aktiv = statScope.filter((s) => !istErledigt(s));
    return {
      mine: aktiv.length,
      faellig: aktiv.filter(
        (s) => isDueToday(s.wiedervorlage_am) || isOverdue(s.wiedervorlage_am),
      ).length,
      wiedervorlage: aktiv.filter((s) => s.wiedervorlage_am != null).length,
      erledigt: statScope.filter(istErledigt).length,
    };
  }, [statScope]);

  const activeStandortName = useMemo(() => {
    if (standortFilter === STANDORT_ALLE) return null;
    if (standortFilter === STANDORT_OHNE) return "Ohne Standort";
    return standorte.find((s) => s.id === standortFilter)?.name ?? null;
  }, [standortFilter, standorte]);

  // Legende bezieht sich auf den aktuell gewählten konkreten Standort.
  const legendStandortId =
    standortFilter !== STANDORT_ALLE && standortFilter !== STANDORT_OHNE
      ? standortFilter
      : null;
  const legendStandortName = legendStandortId
    ? standorte.find((s) => s.id === legendStandortId)?.name ?? null
    : null;
  // Bezeichnung einer Farb-Filter-Schaltfläche (Legende des aktiven Standorts).
  const legendeFor = (farbe: string) => {
    const b = legendStandortId
      ? legendeByStandort[legendStandortId]?.[farbe]?.trim()
      : "";
    return b || MARKIERUNG_FARBEN.find((m) => m.value === farbe)?.label || farbe;
  };

  const tabbed = useMemo(() => {
    // Aktive Liste blendet erledigte Status aus; "Erledigt" zeigt nur diese.
    const aktiv = bereichSchulen.filter((s) => !istErledigt(s));
    switch (tab) {
      case "meine":
        return mine.filter((s) => !istErledigt(s));
      case "faellig":
        return aktiv.filter(
          (s) => isDueToday(s.wiedervorlage_am) || isOverdue(s.wiedervorlage_am),
        );
      case "woche":
        return aktiv.filter((s) => isDueThisWeek(s.wiedervorlage_am));
      case "wiedervorlage":
        return aktiv.filter((s) => s.wiedervorlage_am != null);
      case "erledigt":
        return bereichSchulen.filter(istErledigt);
      case "alle":
      default:
        return aktiv;
    }
  }, [tab, mine, bereichSchulen]);

  // Schulzahlen je Standort für die Seitenleiste – bezogen auf den aktuellen
  // Reiter (Bereich + aktiv/erledigt), damit Badges zur Ansicht passen.
  const sidebarData: SidebarData = useMemo(() => {
    const counts: Record<string, number> = {};
    let ohneCount = 0;
    for (const s of tabbed) {
      if (s.standort_id) counts[s.standort_id] = (counts[s.standort_id] ?? 0) + 1;
      else ohneCount++;
    }
    return {
      standorte,
      vorgeschlagen,
      counts,
      ohneCount,
      total: tabbed.length,
    };
  }, [tabbed, standorte, vorgeschlagen]);

  // Alle Filter AUSSER der Schulart-Kategorie – Basis für die Tab-Zählung.
  const preSchulart = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tabbed
      .filter(matchStandort)
      .filter((s) => statusFilter === "all" || s.status === statusFilter)
      .filter((s) => ringFilter === "all" || String(s.ring) === ringFilter)
      .filter((s) => bezirkFilter === "all" || ortVon(s) === bezirkFilter)
      .filter((s) => {
        if (markFilter === "all") return true;
        if (markFilter === "none") return !s.markierung_farbe;
        return s.markierung_farbe === markFilter;
      })
      .filter((s) => {
        if (!q) return true;
        return (
          s.name.toLowerCase().includes(q) ||
          (s.stadt ?? "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => compareSchulen(a, b, sortBy));
  }, [tabbed, matchStandort, statusFilter, ringFilter, bezirkFilter, markFilter, search, sortBy]);

  // Bezirks-/Ortsoptionen aus dem aktuellen Standort-Scope (Feld bezirk, sonst stadt).
  const bezirkOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of bereichSchulen.filter(matchStandort)) {
      const o = ortVon(s);
      if (o) set.add(o);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "de"));
  }, [bereichSchulen, matchStandort]);

  // Ring ist ein Brandenburg-Konzept: Dropdown nur zeigen, wenn der aktuelle
  // Standort-Scope überhaupt Schulen mit gesetztem Ring enthält.
  const hatRinge = useMemo(
    () => bereichSchulen.filter(matchStandort).some((s) => s.ring != null),
    [bereichSchulen, matchStandort],
  );

  // Anzahl je Schulart-Kategorie (innerhalb der übrigen aktiven Filter).
  const schulartCounts = useMemo(() => {
    const c = { all: preSchulart.length, grundschule: 0, weiterfuehrende: 0, berufsschule: 0 };
    for (const s of preSchulart) c[schulartKategorie(s.schulart)]++;
    return c;
  }, [preSchulart]);

  const filtered = useMemo(() => {
    // Schulart-Kategorien gibt es nur im Schulen-Bereich.
    if (bereich !== "schule" || schulartFilter === "all") return preSchulart;
    return preSchulart.filter(
      (s) => schulartKategorie(s.schulart) === schulartFilter,
    );
  }, [preSchulart, schulartFilter, bereich]);

  // Reihenfolge für die Vor/Zurück-Navigation in der Detailansicht merken.
  // filtered ist bereits standort-gescoped; standortFilter/bereich zusätzlich
  // in den Deps, damit ein Standortwechsel die Reihenfolge garantiert neu
  // schreibt (Pfeile bleiben im gewählten Standort, Anzeige "X / 539").
  useEffect(() => {
    writeSchulOrder(filtered.map((s) => s.id));
  }, [filtered, standortFilter, bereich]);

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
            onChange={changeStandort}
            isAdmin={admin}
            leitungen={leitungen}
            totalCounts={totalByStandort}
          />
        </div>
      </aside>

      <div
        className={cn(
          "min-w-0 flex-1 space-y-5",
          admin && selected.size > 0 && "pb-28",
        )}
      >
        {/* Bereich-Umschalter + Neue Schule/Träger */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex rounded-lg border p-0.5">
            <button
              type="button"
              onClick={() => changeBereich("schule")}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                bereich === "schule"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Schulen
            </button>
            <button
              type="button"
              onClick={() => changeBereich("traeger")}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                bereich === "traeger"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Soziale Träger
            </button>
          </div>

          {(admin || standorte.length > 0) && (
            <NeueSchuleDialog
              standorte={standorte}
              leitungen={leitungen}
              isAdmin={admin}
              meId={me.id}
              meName={me.name}
              defaultStandortId={
                standortFilter !== STANDORT_ALLE &&
                standortFilter !== STANDORT_OHNE
                  ? standortFilter
                  : ""
              }
              bereich={bereich}
            />
          )}
        </div>

        {/* Statistik-Kacheln */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label={
              admin ? `${nomen} gesamt` : `Meine ${nomen}`
            }
            value={stats.mine}
            icon={School}
            accent="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
            active={tab === (admin ? "alle" : "meine")}
            onClick={() => {
              setTab(admin ? "alle" : "meine");
              setStatusFilter("all");
              setMarkFilter("all");
            }}
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
            label="Wiedervorlage"
            value={stats.wiedervorlage}
            icon={MessagesSquare}
            accent="bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-200"
            active={tab === "wiedervorlage"}
            onClick={() => setTab("wiedervorlage")}
          />
          <StatCard
            label="Erledigt"
            value={stats.erledigt}
            icon={Handshake}
            accent="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200"
            active={tab === "erledigt"}
            onClick={() => setTab("erledigt")}
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
                  changeStandort(v);
                  setMobileNavOpen(false);
                }}
                isAdmin={admin}
                leitungen={leitungen}
                totalCounts={totalByStandort}
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
            <TabsTrigger value="alle">Aktiv</TabsTrigger>
            <TabsTrigger value="erledigt">Erledigt</TabsTrigger>
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
              placeholder={`${nomenSg} oder Stadt suchen…`}
              className="pl-9"
            />
          </div>
          <div className="flex gap-2">
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter((v as string) ?? "all")}>
              <SelectTrigger className="w-full min-w-32 sm:w-40">
                <SelectValue placeholder="Status">
                  {(v: string) =>
                    v === "all" || !v
                      ? "Alle Status"
                      : STATUS_LIST.find((s) => s.value === v)?.label ?? v
                  }
                </SelectValue>
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
            {hatRinge && (
              <Select value={ringFilter} onValueChange={(v) => setRingFilter((v as string) ?? "all")}>
                <SelectTrigger className="w-full min-w-24 sm:w-32">
                  <SelectValue placeholder="Ring">
                    {(v: string) =>
                      v === "all" || !v ? "Alle Ringe" : ringLabel(Number(v))
                    }
                  </SelectValue>
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
            )}

            {bezirkOptions.length > 0 && (
              <Select
                value={bezirkFilter}
                onValueChange={(v) => setBezirkFilter((v as string) ?? "all")}
              >
                <SelectTrigger className="w-full min-w-32 sm:w-44">
                  <SelectValue placeholder="Bezirk">
                    {(v: string) => (v === "all" || !v ? "Alle Bezirke" : v)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Bezirke</SelectItem>
                  {bezirkOptions.map((b) => (
                    <SelectItem key={b} value={b}>
                      {b}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Select
              value={sortBy}
              onValueChange={(v) => setSortBy((v as SortKey) ?? "kontakt_alt")}
            >
              <SelectTrigger className="w-full min-w-40 sm:w-56">
                <SelectValue placeholder="Sortieren nach">
                  {(v: string) =>
                    SORT_OPTIONS.find((o) => o.value === v)?.label ??
                    "Sortieren nach"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
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

        {/* Schulart-Kategorien – nur im Schulen-Bereich */}
        {bereich === "schule" && (
          <Tabs
            value={schulartFilter}
            onValueChange={(v) => setSchulartFilter(v as SchulartKategorie | "all")}
          >
            <TabsList className="flex w-full flex-wrap">
              <TabsTrigger value="all">
                Alle
                <SchulartCount n={schulartCounts.all} active={schulartFilter === "all"} />
              </TabsTrigger>
              {SCHULART_KATEGORIEN.map((k) => (
                <TabsTrigger key={k.value} value={k.value}>
                  {k.label}
                  <SchulartCount
                    n={schulartCounts[k.value]}
                    active={schulartFilter === k.value}
                  />
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}

        {/* Markierungs-Toolbar: Farbfilter + Legende */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => setMarkFilter("all")}
              className={cn(
                "rounded-md px-2 py-1 text-xs transition-colors",
                markFilter === "all"
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted/60",
              )}
            >
              Alle Farben
            </button>
            {MARKIERUNG_FARBEN.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() =>
                  setMarkFilter((cur) => (cur === m.value ? "all" : m.value))
                }
                aria-pressed={markFilter === m.value}
                title={legendeFor(m.value)}
                className={cn(
                  "flex size-7 items-center justify-center rounded-md border transition-colors",
                  markFilter === m.value
                    ? "border-foreground"
                    : "border-transparent hover:bg-muted/60",
                )}
              >
                <span className={cn("size-3.5 rounded-full", m.dot)} />
              </button>
            ))}
          </div>

          <FarbLegendeDialog
            standortId={legendStandortId}
            standortName={legendStandortName}
            legende={legendStandortId ? legendeByStandort[legendStandortId] ?? {} : {}}
            editable={
              !!legendStandortId &&
              (admin || editableStandortIds.has(legendStandortId))
            }
          />
        </div>

        {/* Liste */}
        <div>
          <p className="mb-2 text-sm text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? nomenSg : nomen}
            {activeStandortName && (
              <> · {activeStandortName}</>
            )}
          </p>
          {filtered.length === 0 ? (
            <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
              Keine {nomen} in dieser Ansicht.
            </div>
          ) : view === "liste" ? (
            <SchulTable
              schulen={filtered}
              showLeitung={admin}
              selectable={admin}
              selectedIds={selected}
              onToggle={toggleOne}
              isAdmin={admin}
              editableStandortIds={editableStandortIds}
              legendeByStandort={legendeByStandort}
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
                  markEditable={
                    admin ||
                    (!!s.standort_id && editableStandortIds.has(s.standort_id))
                  }
                  legende={legendeByStandort[s.standort_id ?? ""]}
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
                    <SelectValue placeholder="Standort zuweisen…">
                      {(v: string) =>
                        v
                          ? standorte.find((s) => s.id === v)?.name ??
                            "Standort zuweisen…"
                          : "Standort zuweisen…"
                      }
                    </SelectValue>
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
                    <SelectValue placeholder="Leitung zuweisen…">
                      {(v: string) =>
                        v
                          ? leitungen.find((l) => l.id === v)?.name ??
                            "Leitung zuweisen…"
                          : "Leitung zuweisen…"
                      }
                    </SelectValue>
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

function SchulartCount({ n, active }: { n: number; active: boolean }) {
  return (
    <span
      className={cn(
        "ml-1.5 rounded-full px-1.5 text-xs tabular-nums",
        active ? "bg-primary/15 text-primary" : "text-muted-foreground",
      )}
    >
      {n}
    </span>
  );
}
