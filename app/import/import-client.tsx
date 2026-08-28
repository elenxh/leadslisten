"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Standort } from "@/lib/types";
import { importTutorio, type TutorioImportResult } from "./actions";

const KEIN_STANDORT = "__none__";

export function TutorioImportClient({ standorte }: { standorte: Standort[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [standort, setStandort] = useState<string>(KEIN_STANDORT);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<TutorioImportResult | null>(null);

  function pickFile(f: File | null) {
    setResult(null);
    if (f && !/\.xlsx?$/i.test(f.name)) {
      toast.error("Bitte eine .xlsx-Datei wählen.");
      return;
    }
    setFile(f);
  }

  function reset() {
    setFile(null);
    setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function runImport() {
    if (!file || standort === KEIN_STANDORT) return;
    const fd = new FormData();
    fd.set("file", file);
    fd.set("standortId", standort);
    start(async () => {
      const res = await importTutorio(fd);
      setResult(res);
      if (res.ok) {
        toast.success(
          `${res.createdTotal} neu angelegt` +
            (res.skippedCount ? `, ${res.skippedCount} übersprungen` : ""),
        );
        router.refresh();
      } else {
        toast.error("Import nicht durchgeführt", {
          description: res.error ?? `${res.errors?.length ?? 0} Fehler`,
        });
      }
    });
  }

  // --- Erfolgs-Zusammenfassung ---
  if (result?.ok) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="size-8 text-emerald-500" />
              <h2 className="text-lg font-semibold">Import abgeschlossen</h2>
            </div>

            <div>
              <p className="text-sm font-medium">
                {result.createdTotal} neu angelegt
              </p>
              <ul className="mt-1 space-y-0.5 text-sm text-muted-foreground">
                {result.createdBySheet.map((s) => (
                  <li key={s.sheet}>
                    {s.sheet}: <strong>{s.count}</strong>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="text-sm font-medium">
                {result.skippedCount} wegen Duplikat übersprungen
              </p>
              {result.skippedCount > 0 && (
                <ul className="mt-1 max-h-48 space-y-0.5 overflow-y-auto text-sm text-muted-foreground">
                  {result.skipped.map((s, i) => (
                    <li key={i}>
                      {s.name}{" "}
                      <span className="text-xs">({s.sheet})</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="outline" onClick={reset}>
                Weitere Datei importieren
              </Button>
              <Button onClick={() => router.push("/dashboard")}>
                Zum Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    );
  }

  const validationErrors =
    result && !result.ok && result.errors ? result.errors : null;

  return (
    <main className="mx-auto max-w-2xl space-y-5 px-4 py-6">
      <div>
        <h1 className="text-xl font-semibold">Schulen & Träger importieren</h1>
        <p className="text-sm text-muted-foreground">
          Excel nach der Vorlage „Tutorio_Vorlage_Schulen_und_Träger“ (.xlsx).
          Reiter: Grundschule · Weiterführende · Gymnasium · Soziale Träger.
        </p>
      </div>

      {/* Standort-Auswahl */}
      <div className="space-y-2">
        <Label>Standort</Label>
        <Select value={standort} onValueChange={(v) => setStandort((v as string) ?? KEIN_STANDORT)}>
          <SelectTrigger className="w-full" data-testid="standort-select">
            <SelectValue>
              {(v: string) =>
                v && v !== KEIN_STANDORT
                  ? standorte.find((s) => s.id === v)?.name ?? "Standort wählen"
                  : "Standort wählen"
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {standorte.length === 0 ? (
              <SelectItem value={KEIN_STANDORT} disabled>
                Keine Standorte verfügbar
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
        <p className="text-xs text-muted-foreground">
          Es wird in den gewählten Standort importiert. Du siehst nur Standorte,
          für die du berechtigt bist.
        </p>
      </div>

      {/* Datei-Auswahl */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          pickFile(e.dataTransfer.files?.[0] ?? null);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
          dragOver ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
        }`}
      >
        <UploadCloud className="size-8 text-muted-foreground" />
        <p className="text-sm font-medium">
          {file ? file.name : "Datei hierher ziehen oder klicken"}
        </p>
        <p className="text-xs text-muted-foreground">Nur .xlsx</p>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          data-testid="file-input"
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
        />
      </div>

      {/* Validierungsfehler (alles-oder-nichts) */}
      {validationErrors && (
        <Card className="border-destructive/40">
          <CardContent className="space-y-2 p-4">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-4" />
              <p className="text-sm font-medium">
                {validationErrors.length}{" "}
                {validationErrors.length === 1 ? "Fehler" : "Fehler"} – nichts
                importiert
              </p>
            </div>
            <ul
              className="max-h-64 space-y-1 overflow-y-auto text-sm text-destructive"
              data-testid="validation-errors"
            >
              {validationErrors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              Bitte in der Datei korrigieren und erneut hochladen.
            </p>
          </CardContent>
        </Card>
      )}

      {result && !result.ok && result.error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {result.error}
        </p>
      )}

      {/* Aktion */}
      <div className="flex justify-end gap-2">
        <Button
          onClick={runImport}
          disabled={pending || !file || standort === KEIN_STANDORT}
          data-testid="import-btn"
        >
          {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
          Importieren
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Neu angelegte Einträge starten mit Status „Neu“, ohne Verlaufseintrag.
        Bereits vorhandene Namen am selben Standort werden übersprungen (nicht
        überschrieben).
      </p>
    </main>
  );
}
