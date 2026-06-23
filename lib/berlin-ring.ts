// Maps a Berlin-area town to its commute ring (1 = closest .. 4 = farthest).
// Useful as a helper when importing or correcting school data.

const RING_TOWNS: Record<number, string[]> = {
  1: [
    "Falkensee", "Brieselang", "Dallgow", "Wustermark", "Hennigsdorf",
    "Birkenwerder", "Hohen Neuendorf", "Glienicke", "Mühlenbecker Land",
    "Panketal", "Ahrensfelde", "Bernau", "Neuenhagen", "Hoppegarten",
    "Fredersdorf", "Petershagen", "Eggersdorf", "Schöneiche", "Erkner",
    "Wildau", "Zeuthen", "Eichwalde", "Schulzendorf", "Schönefeld",
    "Mahlow", "Blankenfelde", "Großbeeren", "Teltow", "Stahnsdorf",
    "Kleinmachnow", "Leegebruch",
  ],
  2: [
    "Werder", "Velten", "Wandlitz", "Oranienburg", "Werneuchen",
    "Altlandsberg", "Strausberg", "Rüdersdorf", "Königs Wusterhausen",
    "Mittenwalde", "Bestensee", "Trebbin", "Ludwigsfelde", "Rangsdorf",
    "Michendorf", "Beelitz",
  ],
  3: [
    "Eberswalde", "Liebenwalde", "Kremmen", "Zehdenick", "Gransee", "Nauen",
    "Brück", "Bad Belzig", "Treuenbrietzen", "Luckenwalde", "Jüterbog",
    "Baruth", "Zossen", "Storkow", "Bad Saarow", "Fürstenwalde",
    "Müncheberg", "Seelow",
  ],
  4: [
    "Bad Freienwalde", "Wriezen", "Joachimsthal", "Friesack", "Premnitz",
    "Rhinow", "Milower Land", "Nennhausen", "Rathenow", "Eisenhüttenstadt",
    "Lübben", "Lübbenau", "Luckau", "Wiesenburg",
  ],
};

// Pre-built lookup: normalized town name -> ring.
const TOWN_TO_RING = new Map<string, number>();
for (const [ring, towns] of Object.entries(RING_TOWNS)) {
  for (const town of towns) {
    TOWN_TO_RING.set(normalize(town), Number(ring));
  }
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Returns the Berlin ring (1–4) for a given town/city, or null if unknown.
 * Matches case-insensitively and also on the first word (e.g. "Bernau bei Berlin").
 */
export function ringForTown(town: string | null | undefined): number | null {
  if (!town) return null;
  const norm = normalize(town);
  if (TOWN_TO_RING.has(norm)) return TOWN_TO_RING.get(norm)!;

  // Try matching the leading part before a comma or "bei"/"(".
  const head = normalize(norm.split(/[,(]|\bbei\b/)[0]);
  if (TOWN_TO_RING.has(head)) return TOWN_TO_RING.get(head)!;

  // Fall back to a town name contained at the start of the input.
  for (const [name, ring] of Array.from(TOWN_TO_RING.entries())) {
    if (norm.startsWith(name)) return ring;
  }
  return null;
}

export const RING_OPTIONS = [1, 2, 3, 4, 5];

export function ringLabel(ring: number | null | undefined): string {
  if (ring == null) return "—";
  const km: Record<number, string> = {
    1: "10–25 km",
    2: "25–40 km",
    3: "40–60 km",
    4: "60+ km",
  };
  return km[ring] ? `Ring ${ring} · ${km[ring]}` : `Ring ${ring}`;
}
