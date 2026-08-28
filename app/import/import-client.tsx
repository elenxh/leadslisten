"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
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
import {
  previewTutorio,
  importTutorio,
  type PreviewRow,
  type TutorioPreviewResult,
  type TutorioImportResult,
} from "./actions";

const KEIN_STANDORT = "__none__";

export function TutorioImportClient({ standorte }: { standorte: Standort[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [standort, setStandort] = useState<string>(KEIN_STANDORT);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pending, start] = useTransition();
  const [preview, setPreview] = useState<TutorioPreviewResult | null>(null);
  const [result, setResult] = useState<TutorioImportResult | null>(null);

  function pickFile(f: File | null) {
    setPreview(null);
    setResult(null);
    if (f && !/\.xlsx?$/i.test(f.name)) {
      toast.error("Bitte eine .xlsx-Datei wählen.");
      return;
    }
    setFile(f);
  }

  function resetAll() {
    setFile(null);
    setPreview(null);
    setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function buildFormData(): FormData {
    const fd = new FormData();
    fd.set("file", file as File);
    fd.set("standortId", standort);
    return fd;
  }

  function runPreview() {
    if (!file || standort === KEIN_STANDORT) return;
    start(async () => {
      const res = await previewTutorio(buildFormData());
      setPreview(res);
      if (!res.ok && res.error) {
        toast.error("Vorschau nicht möglich", { description: res.error });
      }
    });
  }

  function confirmImport() {
    if (!file || standort === KEIN_STANDORT) return;
    start(async () => {
      const res = await importTutorio(buildFormData());
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

  // ===== SCHRITT 3: Ergebnis =====
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
            {result.skippedCount > 0 && (
              <div>
                <p className="text-sm font-medium">
                  {result.skippedCount} übersprungen
                </p>
                <ul className="mt-1 max-h-48 space-y-0.5 overflow-y-auto text-sm text-muted-foreground">
                  {result.skipped.map((s, i) => (
                    <li key={i}>
                      {s.grund === "duplikat" ? "Duplikat" : "Beispielzeile"}:{" "}
                      {s.name} <span className="text-xs">({s.sheet})</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <Button variant="outline" onClick={resetAll}>
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

  // ===== SCHRITT 2: Vorschau (kein Schreiben) =====
  if (preview?.ok) {
    return (
      <PreviewView
        preview={preview}
        pending={pending}
        onCancel={() => setPreview(null)}
        onConfirm={confirmImport}
      />
    );
  }

  // ===== SCHRITT 1: Datei + Standort wählen =====
  const validationErrors =
    preview && !preview.ok && preview.errors ? preview.errors : null;

  return (
    <main className="mx-auto max-w-2xl space-y-5 px-4 py-6">
      <div>
        <h1 className="text-xl font-semibold">Schulen & Träger importieren</h1>
        <p className="text-sm text-muted-foreground">
          Excel nach der Vorlage „Tutorio_Vorlage_Schulen_und_Träger“ (.xlsx).
          Reiter: Schulen · Soziale Träger.
        </p>
      </div>

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
          Du siehst nur Standorte, für die du berechtigt bist.
        </p>
      </div>

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

      {validationErrors && (
        <Card className="border-destructive/40">
          <CardContent className="space-y-2 p-4">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-4" />
              <p className="text-sm font-medium">
                {validationErrors.length} Fehler – kein Import möglich
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

      {preview && !preview.ok && preview.error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {preview.error}
        </p>
      )}

      <div className="flex justify-end">
        <Button
          onClick={runPreview}
          disabled={pending || !file || standort === KEIN_STANDORT}
          data-testid="vorschau-btn"
        >
          {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
          Vorschau erstellen
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Nach der Vorschau bestätigst du den Import. Neu angelegte Einträge starten
        mit Status „Neu“, ohne Verlaufseintrag; vorhandene Namen am selben Standort
        werden übersprungen.
      </p>
    </main>
  );
}

export function PreviewView({
  preview,
  pending,
  onCancel,
  onConfirm,
}: {
  preview: Extract<TutorioPreviewResult, { ok: true }>;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const schulen = preview.create.filter((r) => r.typ === "schule");
  const traeger = preview.create.filter((r) => r.typ === "traeger");
  const nichts = preview.create.length === 0;
  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-6" data-testid="preview-view">
      <div>
        <h1 className="text-xl font-semibold">Vorschau</h1>
        <p className="text-sm text-muted-foreground">
          Standort: <strong>{preview.standortName}</strong> · Es wird noch nichts
          gespeichert.
        </p>
      </div>

      {nichts ? (
        <Card className="border-amber-500/40">
          <CardContent className="flex items-center gap-2 p-4 text-sm">
            <AlertTriangle className="size-4 text-amber-500" />
            Keine importierbaren Zeilen – alles wurde als Duplikat oder
            Beispielzeile aussortiert (siehe unten).
          </CardContent>
        </Card>
      ) : (
        <>
          <PreviewSection title="Schulen" rows={schulen} artLabel="Schulart" />
          <PreviewSection title="Soziale Träger" rows={traeger} artLabel="Art" />
        </>
      )}

      {preview.skipped.length > 0 && (
        <Card>
          <CardContent className="space-y-1 p-4">
            <p className="text-sm font-medium">
              {preview.skipped.length} übersprungen
            </p>
            <ul
              className="max-h-56 space-y-0.5 overflow-y-auto text-sm text-muted-foreground"
              data-testid="preview-skipped"
            >
              {preview.skipped.map((s, i) => (
                <li key={i} data-testid="preview-skip-row">
                  {s.grund === "duplikat" ? "Duplikat" : "Beispielzeile"}:{" "}
                  {s.name} <span className="text-xs">({s.sheet})</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between gap-2">
        <Button
          variant="outline"
          onClick={onCancel}
          disabled={pending}
          data-testid="cancel-btn"
        >
          <ArrowLeft className="mr-1.5 size-4" />
          Abbrechen
        </Button>
        <Button
          onClick={onConfirm}
          disabled={pending || nichts}
          data-testid="confirm-btn"
        >
          {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
          Import bestätigen ({preview.create.length})
        </Button>
      </div>
    </main>
  );
}

function PreviewSection({
  title,
  rows,
  artLabel,
}: {
  title: string;
  rows: PreviewRow[];
  artLabel: string;
}) {
  if (rows.length === 0) return null;
  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center justify-between border-b px-4 py-2">
          <span className="text-sm font-medium">{title}</span>
          <span className="text-xs text-muted-foreground">{rows.length}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">{artLabel}</th>
                <th className="px-4 py-2 font-medium">Ansprechpartner</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b last:border-0" data-testid="preview-create-row">
                  <td className="px-4 py-2 font-medium">{r.name}</td>
                  <td className="px-4 py-2">{r.schulart || "—"}</td>
                  <td className="px-4 py-2">{r.ansprechpartner || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
