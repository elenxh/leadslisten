"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/app/status-badge";
import { STATUS_LIST } from "@/lib/status";
import { updateStatus } from "@/app/standorte/actions";
import type { SchulStatus } from "@/lib/types";

/**
 * Inline-Statuswechsel in der Listen-Ansicht: Klick öffnet ein Dropdown, die
 * Auswahl wird optimistisch gesetzt und per Server-Action gespeichert. Bei
 * Fehler wird der alte Wert wiederhergestellt. Steht in einer <Link>-Zeile,
 * daher werden Klicks hier gestoppt, damit die Zeile nicht navigiert.
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

  function change(v: SchulStatus | null) {
    if (!v) return;
    const next = v;
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
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <Select value={val} onValueChange={change}>
        <SelectTrigger
          aria-label="Status ändern"
          className="h-auto gap-1 border-0 bg-transparent px-0 py-0 shadow-none hover:opacity-80 focus-visible:ring-0 dark:bg-transparent dark:hover:bg-transparent"
        >
          <StatusBadge status={val} />
        </SelectTrigger>
        <SelectContent>
          {STATUS_LIST.map((s) => (
            <SelectItem key={s.value} value={s.value}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {pending && (
        <Loader2 className="size-3 shrink-0 animate-spin text-muted-foreground" />
      )}
    </span>
  );
}
