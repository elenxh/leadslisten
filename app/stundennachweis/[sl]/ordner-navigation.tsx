"use client";

import { useState } from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";

export interface MonatsKachel {
  monat: number;
  key: string;
  label: string;
  aktuell: boolean;
  zukunft: boolean;
}

export function OrdnerNavigation({
  slId,
  jahre,
  defaultJahr,
  activeKey,
  kacheln,
}: {
  slId: string;
  jahre: number[];
  defaultJahr: number;
  activeKey: string;
  kacheln: Record<number, MonatsKachel[]>;
}) {
  const [jahr, setJahr] = useState(defaultJahr);
  const tiles = kacheln[jahr] ?? [];

  return (
    <div className="space-y-3">
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

      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {tiles.map((t) => {
          const aktiv = t.key === activeKey;
          return (
            <Link
              key={t.key}
              href={`/stundennachweis/${slId}?zeitraum=${t.key}`}
              scroll={false}
              data-testid="monat-kachel"
              aria-current={aktiv ? "page" : undefined}
              className={cn(
                "flex items-center justify-center rounded-lg border py-3 text-sm font-medium transition-colors hover:bg-muted",
                aktiv
                  ? "border-primary bg-primary text-primary-foreground hover:bg-primary"
                  : t.aktuell
                    ? "border-primary/50 text-primary"
                    : t.zukunft && "border-dashed text-muted-foreground",
              )}
            >
              {t.label}
            </Link>
          );
        })}
        {tiles.length === 0 && (
          <p className="col-span-full text-sm text-muted-foreground">Keine Monate.</p>
        )}
      </div>
    </div>
  );
}
