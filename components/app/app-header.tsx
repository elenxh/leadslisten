"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogOut, ShieldCheck } from "lucide-react";

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
    </header>
  );
}
