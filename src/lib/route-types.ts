export type ModeKey = "bus" | "rail" | "stog" | "metro" | "tram" | "ferry";

export const ROUTE_TYPE_TO_MODE: Record<number, ModeKey> = {
  0: "tram",
  1: "metro",
  2: "rail",
  3: "bus",
  4: "ferry",
  109: "stog",
  700: "bus",
  715: "bus",
};

export function normalizeRouteType(routeType: number): ModeKey {
  return ROUTE_TYPE_TO_MODE[routeType] ?? "bus";
}

export const MODE_CONFIG: Record<ModeKey, { label: string; color: string }> = {
  bus:   { label: "Bus",     color: "hsl(15, 70%, 50%)" },
  stog:  { label: "S-tog",   color: "hsl(45, 80%, 60%)" },
  rail:  { label: "Tog",     color: "hsl(0, 80%, 55%)" },
  metro: { label: "Metro",   color: "hsl(200, 60%, 50%)" },
  tram:  { label: "Letbane", color: "hsl(130, 50%, 45%)" },
  ferry: { label: "Færge",   color: "hsl(220, 70%, 55%)" },
};

export const MODE_KEYS: ModeKey[] = ["bus", "stog", "rail", "metro", "tram", "ferry"];
