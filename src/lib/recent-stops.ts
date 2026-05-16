const MAX_RECENT = 3;

function storageKey(selectorKey: string): string {
  return `recent-stops-${selectorKey}`;
}

export function getRecentStops(selectorKey: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey(selectorKey));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string").slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

export function addRecentStop(selectorKey: string, stopName: string): void {
  if (typeof window === "undefined") return;
  try {
    const current = getRecentStops(selectorKey);
    const updated = [stopName, ...current.filter((s) => s !== stopName)].slice(0, MAX_RECENT);
    localStorage.setItem(storageKey(selectorKey), JSON.stringify(updated));
  } catch {
    // Silently fail if localStorage is unavailable
  }
}
