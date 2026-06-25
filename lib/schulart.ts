// Grobe Kategorisierung der (frei eingetragenen) Schulart in 3 Gruppen.
// Wird NUR im Code berechnet, nicht in der DB gespeichert.

export type SchulartKategorie =
  | "grundschule"
  | "weiterfuehrende"
  | "berufsschule";

export interface SchulartKategorieMeta {
  value: SchulartKategorie;
  label: string;
}

export const SCHULART_KATEGORIEN: SchulartKategorieMeta[] = [
  { value: "grundschule", label: "Grundschule" },
  { value: "weiterfuehrende", label: "Weiterführende" },
  { value: "berufsschule", label: "Berufsschule" },
];

/**
 * Leitet aus der freien `schulart` eine der drei Kategorien ab.
 * - enthält "grundschule" -> Grundschule
 * - enthält "beruf"/"fachschule"/"osz"/"oberstufenzentrum" oder == "ZBW"
 *   -> Berufsschule
 * - sonst -> Weiterführende
 */
export function schulartKategorie(
  schulart: string | null | undefined,
): SchulartKategorie {
  const s = (schulart ?? "").trim().toLowerCase();

  if (s.includes("grundschule")) return "grundschule";

  if (
    s.includes("beruf") ||
    s.includes("fachschule") ||
    s.includes("osz") ||
    s.includes("oberstufenzentrum") ||
    s === "zbw"
  ) {
    return "berufsschule";
  }

  return "weiterfuehrende";
}

export function schulartKategorieLabel(k: SchulartKategorie): string {
  return SCHULART_KATEGORIEN.find((x) => x.value === k)?.label ?? k;
}
