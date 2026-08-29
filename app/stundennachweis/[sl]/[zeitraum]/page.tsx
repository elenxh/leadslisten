import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Monatsseite und Ordnerübersicht sind zu EINER Seite zusammengefasst
// (/stundennachweis/[sl]?zeitraum=…). Alte Links bleiben gültig.
export default function MonatRedirect({
  params,
}: {
  params: { sl: string; zeitraum: string };
}) {
  const key = /^\d{4}-\d{2}-\d{2}$/.test(params.zeitraum) ? params.zeitraum : "";
  redirect(`/stundennachweis/${params.sl}${key ? `?zeitraum=${key}` : ""}`);
}
