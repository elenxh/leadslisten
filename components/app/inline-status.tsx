"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusBadge } from "@/components/app/status-badge";
import { STATUS_LIST } from "@/lib/status";
import { updateStatus } from "@/app/standorte/actions";
import { cn } from "@/lib/utils";
import type { SchulStatus } from "@/lib/types";

/**
 * Inline-Statuswechsel in der Listen-Ansicht: Klick auf das Badge öffnet ein
 * Menü der Pipeline-Werte; die Auswahl wird optimistisch gesetzt und per
 * Server-Action gespeichert (bei Fehler Rücksetzen). Nutzt bewusst denselben
 * DropdownMenu-Baustein wie SchulMarkierung – Base UI Select rendert versteckte
 * Inputs/Portale und würde in der <a>-Zeile Hydration-Mismatches auslösen.
 */
export function InlineStatus({
  schuleId,
  status,
}: {
  schuleId: string;
  status: SchulStatus;
}) {
  const [val, setVal] = useState<SchulStatus>(status);
  const [pending, start] = useTransition();

  function choose(next: SchulStatus) {
    if (next === val) return;
    const prev = val;
    setVal(next); // optimistisch
    start(async () => {
      const res = await updateStatus(schuleId, next);
      if (!res.ok) {
        setVal(prev);
        toast.error("Status nicht gespeichert", { description: res.error });
      }
    });
  }

  return (
    <span
      className="inline-flex items-center gap-1"
      onClick={(e) => e.stopPropagation()}
    >
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              disabled={pending}
              aria-label="Status ändern"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              className="inline-flex items-center rounded-md text-left transition-opacity hover:opacity-80 disabled:opacity-50"
            >
              <StatusBadge status={val} />
            </button>
          }
        />
        <DropdownMenuContent align="start" className="w-56">
          {STATUS_LIST.map((s) => (
            <DropdownMenuItem key={s.value} onClick={() => choose(s.value)}>
              <span
                className={cn(
                  "truncate",
                  s.value === val && "font-semibold text-foreground",
                )}
              >
                {s.label}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {pending && (
        <Loader2 className="size-3 shrink-0 animate-spin text-muted-foreground" />
      )}
    </span>
  );
}
