"use client";

import { useState } from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";

export interface MonatsKachel {
  monat: number;
  key: string;
  label: string;
  aktuell: boolean;
}

export function OrdnerNavigation({
  slId,
  jahre,
  defaultJahr,
  kacheln,
}: {
  slId: string;
  jahre: number[];
  defaultJahr: number;
  kacheln: Record<number, MonatsKachel[]>;
}) {
  const [jahr, setJahr] = useState(defaultJahr);
  const tiles = kacheln[jahr] ?? [];

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-lg border p-0.5" data-testid="jahr-register">
        {jahre.map((j) => (
          <button
            key={j}
            type="button"
            onClick={() => setJahr(j)}
            data-testid="jahr-tab"
            className={cn(
              "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
              j === jahr
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {j}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
        {tiles.map((t) => (
          <Link
            key={t.key}
            href={`/stundennachweis/${slId}/${t.key}`}
            data-testid="monat-kachel"
            className={cn(
              "flex items-center justify-center rounded-lg border py-4 text-sm font-medium transition-colors hover:bg-muted",
              t.aktuell && "border-primary bg-primary/10 text-primary ring-1 ring-primary",
            )}
          >
            {t.label}
          </Link>
        ))}
        {tiles.length === 0 && (
          <p className="col-span-full text-sm text-muted-foreground">Keine Monate.</p>
        )}
      </div>
    </div>
  );
}
