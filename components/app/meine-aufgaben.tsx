"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ListTodo, Loader2, Square } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { formatDate, todayISO } from "@/lib/dates";
import { setAufgabeErledigt } from "@/app/aufgaben/actions";

export interface AufgabeAnzeige {
  id: string;
  was: string;
  bis_wann: string; // ISO date
}

// Box „Meine Aufgaben": offene Aufgaben der SL, überfällige hervorgehoben.
// readOnly = nur Anzeige (z. B. im Stundennachweis); sonst abhakbar.
export function MeineAufgabenBox({
  aufgaben,
  readOnly = false,
  titel = "Meine Aufgaben",
}: {
  aufgaben: AufgabeAnzeige[];
  readOnly?: boolean;
  titel?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  if (aufgaben.length === 0) return null;
  const heute = todayISO();

  function abhaken(id: string) {
    start(async () => {
      const res = await setAufgabeErledigt(id, true);
      if (!res.ok) {
        toast.error("Nicht gespeichert", { description: res.error });
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border bg-card p-3" data-testid="meine-aufgaben">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
        <ListTodo className="size-3.5 text-primary" />
        {titel}
      </div>
      <ul className="space-y-1.5">
        {aufgaben.map((a) => {
          const ueberfaellig = a.bis_wann.slice(0, 10) < heute;
          return (
            <li
              key={a.id}
              className="flex items-start gap-2 rounded-md border bg-background px-2 py-1.5"
              data-testid="aufgabe-item"
            >
              {readOnly ? (
                <Square className="mt-0.5 size-4 shrink-0 text-muted-foreground/50" />
              ) : (
                <button
                  type="button"
                  onClick={() => abhaken(a.id)}
                  disabled={pending}
                  aria-label="Als erledigt markieren"
                  className="mt-0.5 shrink-0 text-muted-foreground hover:text-primary"
                  data-testid="aufgabe-check"
                >
                  {pending ? <Loader2 className="size-4 animate-spin" /> : <Square className="size-4" />}
                </button>
              )}
              <span className="min-w-0 flex-1">
                <span className="block text-xs leading-snug">{a.was}</span>
                <span
                  className={cn(
                    "block text-[10px]",
                    ueberfaellig
                      ? "font-medium text-red-600 dark:text-red-400"
                      : "text-muted-foreground",
                  )}
                >
                  {ueberfaellig ? "überfällig · " : "bis "}
                  {formatDate(a.bis_wann)}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
