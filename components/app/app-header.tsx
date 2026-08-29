"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarDays, ClipboardList, Clock, FileSpreadsheet, FileUp, LogOut, ShieldCheck, Upload, Users, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LeitungAvatar } from "@/components/app/leitung-avatar";
import { createClient } from "@/lib/supabase/client";
import type { Leitung } from "@/lib/types";

export function AppHeader({ leitung }: { leitung: Leitung }) {
  const router = useRouter();
  const [slUnread, setSlUnread] = useState(0);

  // Ungelesene SL-Meetings (nur für SLs) für den Badge zählen.
  useEffect(() => {
    if (leitung.rolle === "admin") return;
    let cancel = false;
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancel) return;
      const [{ data: meetings }, { data: ansicht }] = await Promise.all([
        supabase
          .from("sl_meetings")
          .select("created_at, updated_at, sl_meeting_teilnehmer!inner(leitung_id)")
          .eq("sl_meeting_teilnehmer.leitung_id", user.id),
        supabase
          .from("sl_meeting_ansicht")
          .select("gesehen_am")
          .eq("leitung_id", user.id)
          .maybeSingle(),
      ]);
      if (cancel) return;
      const seen = (ansicht as { gesehen_am: string } | null)?.gesehen_am ?? "";
      const rows = (meetings ?? []) as { created_at: string; updated_at: string }[];
      const n = rows.filter(
        (m) => !seen || m.created_at > seen || m.updated_at > seen,
      ).length;
      setSlUnread(n);
    })();
    return () => {
      cancel = true;
    };
  }, [leitung.rolle]);

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4">
        <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
          <span className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground text-xs">
            T
          </span>
          <span className="hidden sm:inline">Tutorio Akquise</span>
        </Link>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" render={<Link href="/team" />}>
            <ClipboardList className="size-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Team</span>
          </Button>
          <Button variant="ghost" size="sm" render={<Link href="/stundennachweis" />}>
            <Clock className="size-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Stundennachweis</span>
          </Button>
          <Button variant="ghost" size="sm" render={<Link href="/import" />}>
            <FileUp className="size-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Import</span>
          </Button>
          {leitung.rolle !== "admin" && (
            <Button
              variant="ghost"
              size="sm"
              className="relative"
              render={<Link href="/sl-meetings" />}
            >
              <CalendarDays className="size-4 sm:mr-1.5" />
              <span className="hidden sm:inline">SL-Meetings</span>
              {slUnread > 0 && (
                <span
                  className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground"
                  data-testid="sl-meetings-badge"
                >
                  {slUnread}
                </span>
              )}
            </Button>
          )}
          {leitung.rolle === "admin" && (
            <Button variant="ghost" size="sm" render={<Link href="/admin/vertragsmodelle" />}>
              <Wallet className="size-4 sm:mr-1.5" />
              <span className="hidden sm:inline">Verträge</span>
            </Button>
          )}
          {leitung.rolle === "admin" && (
            <Button variant="ghost" size="sm" render={<Link href="/admin/sl-meetings" />}>
              <CalendarDays className="size-4 sm:mr-1.5" />
              <span className="hidden sm:inline">SL-Meetings</span>
            </Button>
          )}
          {leitung.rolle === "admin" && (
            <Button variant="ghost" size="sm" render={<Link href="/admin/abrechnung" />}>
              <FileSpreadsheet className="size-4 sm:mr-1.5" />
              <span className="hidden sm:inline">Abrechnung</span>
            </Button>
          )}
          {leitung.rolle === "admin" && (
            <Button variant="ghost" size="sm" render={<Link href="/admin/leitungen" />}>
              <Users className="size-4 sm:mr-1.5" />
              <span className="hidden sm:inline">Leitungen</span>
            </Button>
          )}
          {leitung.rolle === "admin" && (
            <Button variant="ghost" size="sm" render={<Link href="/admin/import" />}>
              <Upload className="size-4 sm:mr-1.5" />
              <span className="hidden sm:inline">Alt-Import</span>
            </Button>
          )}
          <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" className="h-auto gap-2 px-2 py-1" />}
          >
            <LeitungAvatar leitung={leitung} />
            <span className="hidden text-left sm:block">
              <span className="block text-sm leading-tight font-medium">
                {leitung.name}
              </span>
              <span className="block text-xs leading-tight text-muted-foreground">
                {leitung.rolle === "admin" ? "Admin" : leitung.region || "Leitung"}
              </span>
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="flex items-center gap-2">
              {leitung.rolle === "admin" && (
                <ShieldCheck className="size-4 text-emerald-600" />
              )}
              <span className="truncate">{leitung.email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href="/passwort-aendern" />}>
              Passwort ändern
            </DropdownMenuItem>
            <DropdownMenuItem onClick={logout}>
              <LogOut className="mr-2 size-4" />
              Abmelden
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
