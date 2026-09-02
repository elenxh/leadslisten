"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  CalendarDays,
  ChevronDown,
  ClipboardList,
  Clock,
  FileSpreadsheet,
  FileUp,
  Folder,
  LayoutGrid,
  ListTodo,
  LogOut,
  ShieldCheck,
  Upload,
  Users,
  Wallet,
} from "lucide-react";

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
import { cn } from "@/lib/utils";
import type { Leitung } from "@/lib/types";

export function AppHeader({ leitung }: { leitung: Leitung }) {
  const router = useRouter();
  const pathname = usePathname();
  const admin = leitung.rolle === "admin";
  const [slUnread, setSlUnread] = useState(0);

  // Ungelesene SL-Meetings (nur für SLs) für den Badge zählen.
  useEffect(() => {
    if (admin) return;
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
      setSlUnread(rows.filter((m) => !seen || m.created_at > seen || m.updated_at > seen).length);
    })();
    return () => {
      cancel = true;
    };
  }, [admin]);

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const aktiv = (prefixes: string[]) =>
    prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  const slMeetingsHref = admin ? "/admin/sl-meetings" : "/sl-meetings";

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
          {/* Akquise */}
          <NavGroup label="Akquise" active={aktiv(["/dashboard", "/schule", "/standorte", "/import"])}>
            <NavItem href="/dashboard" icon={LayoutGrid} label="Dashboard (Schulen/Träger)" />
            <NavItem href="/import" icon={FileUp} label="Import" />
          </NavGroup>

          {/* Team */}
          <NavGroup label="Team" active={aktiv(["/team", "/stundennachweis", "/aufgaben", "/sl-meetings", "/admin/sl-meetings"])} dot={slUnread > 0}>
            <NavItem href="/team" icon={ClipboardList} label="Gesprächsprotokolle" />
            <NavItem href={slMeetingsHref} icon={CalendarDays} label="SL-Meetings" badge={!admin && slUnread > 0 ? slUnread : undefined} />
            <NavItem href="/aufgaben" icon={ListTodo} label="Aufgaben" />
            <NavItem href={admin ? "/team" : `/team/${leitung.id}#dateien`} icon={Folder} label="Dateien" />
            <NavItem href="/stundennachweis" icon={Clock} label="Stundennachweis" />
          </NavGroup>

          {/* Verwaltung – nur Admin */}
          {admin && (
            <NavGroup label="Verwaltung" active={aktiv(["/admin"])}>
              <NavItem href="/admin/abrechnung" icon={FileSpreadsheet} label="Abrechnung" />
              <NavItem href="/admin/vertragsmodelle" icon={Wallet} label="Verträge" />
              <NavItem href="/admin/leitungen" icon={Users} label="Leitungen" />
              <NavItem href="/admin/import" icon={Upload} label="Alt-Import" />
            </NavGroup>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" className="h-auto gap-2 px-2 py-1" />}>
              <LeitungAvatar leitung={leitung} />
              <span className="hidden text-left sm:block">
                <span className="block text-sm leading-tight font-medium">{leitung.name}</span>
                <span className="block text-xs leading-tight text-muted-foreground">
                  {admin ? "Admin" : leitung.region || "Leitung"}
                </span>
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="flex items-center gap-2">
                {admin && <ShieldCheck className="size-4 text-emerald-600" />}
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

// Dropdown-Gruppe: öffnet auf Desktop bei Hover (kontrolliert per Maus-Timer),
// auf Touch/Klick über den Trigger. Aktiver Bereich wird hervorgehoben.
function NavGroup({
  label,
  active,
  dot,
  children,
}: {
  label: string;
  active: boolean;
  dot?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enter = () => {
    if (timer.current) clearTimeout(timer.current);
    setOpen(true);
  };
  const leave = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(false), 120);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <span onMouseEnter={enter} onMouseLeave={leave} className="inline-flex">
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              className={cn("relative", active && "bg-muted font-medium text-foreground")}
            />
          }
        >
          {label}
          <ChevronDown className="ml-0.5 size-3.5 opacity-60" />
          {dot && (
            <span className="absolute right-0.5 top-0.5 size-2 rounded-full bg-primary" data-testid="nav-dot" />
          )}
        </DropdownMenuTrigger>
      </span>
      <DropdownMenuContent align="start" className="w-60" onMouseEnter={enter} onMouseLeave={leave}>
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NavItem({
  href,
  icon: Icon,
  label,
  badge,
}: {
  href: string;
  icon: typeof LayoutGrid;
  label: string;
  badge?: number;
}) {
  return (
    <DropdownMenuItem render={<Link href={href} />}>
      <Icon className="mr-2 size-4 text-muted-foreground" />
      <span className="flex-1">{label}</span>
      {badge != null && badge > 0 && (
        <span className="ml-2 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground">
          {badge}
        </span>
      )}
    </DropdownMenuItem>
  );
}
