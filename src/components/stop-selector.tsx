"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { searchStops } from "@/app/actions/query-trips";
import { getRecentStops, addRecentStop } from "@/lib/recent-stops";

function HighlightedName({ name, query }: { name: string; query: string }) {
  if (!query) return <span className="truncate">{name}</span>;
  const idx = name.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <span className="truncate">{name}</span>;
  return (
    <span className="truncate">
      {name.slice(0, idx)}
      <strong>{name.slice(idx, idx + query.length)}</strong>
      {name.slice(idx + query.length)}
    </span>
  );
}

interface StopSelectorProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  storageKey: string;
}

export function StopSelector({ label, value, onChange, storageKey }: StopSelectorProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [highlighted, setHighlighted] = React.useState("");
  const [results, setResults] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [recentStops, setRecentStops] = React.useState<string[]>([]);
  const defaultResultsRef = React.useRef<string[] | null>(null);

  // Eagerly fetch default results on mount so they're ready when the popover opens
  React.useEffect(() => {
    searchStops("").then((names) => {
      defaultResultsRef.current = names;
    });
  }, []);

  // Load recent stops when popover opens
  React.useEffect(() => {
    if (open) {
      setRecentStops(getRecentStops(storageKey));
    }
  }, [open, storageKey]);

  React.useEffect(() => {
    if (!open) return;
    const trimmed = search.trim();

    // For empty query, use cached defaults immediately — no debounce or spinner
    if (trimmed === "" && defaultResultsRef.current) {
      setResults(defaultResultsRef.current);
      setHighlighted("");
      setLoading(false);
      return;
    }

    setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      searchStops(trimmed).then((names) => {
        if (!controller.signal.aborted) {
          setHighlighted(trimmed);
          setResults(names);
          setLoading(false);
        }
      });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search, open]);

  function selectStop(name: string) {
    onChange(name);
    addRecentStop(storageKey, name);
    setSearch("");
    setOpen(false);
  }

  const trimmedSearch = search.trim().toLowerCase();
  const filteredRecent = recentStops.filter(
    (name) => trimmedSearch === "" || name.toLowerCase().includes(trimmedSearch)
  );
  const recentSet = new Set(filteredRecent);
  const filteredResults = results.filter((name) => !recentSet.has(name));
  const isEmpty = filteredRecent.length === 0 && filteredResults.length === 0;

  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-foreground">{label}</label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-72 justify-between font-normal"
          >
            <span className="truncate">{value || "Vælg stoppested..."}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0">
          <div className="flex items-center border-b px-3">
            <input
              className="flex h-10 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
              placeholder="Søg stoppested..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
          <div className="max-h-64 overflow-y-auto">
            {loading && filteredRecent.length === 0 ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : isEmpty ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Intet fundet.</p>
            ) : (
              <>
                {filteredRecent.length > 0 && (
                  <>
                    <p className="px-3 pb-1 pt-2 text-xs font-medium text-muted-foreground">
                      Seneste valg
                    </p>
                    {filteredRecent.map((name) => (
                      <button
                        key={`recent-${name}`}
                        className={cn(
                          "flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground",
                          value === name && "bg-accent text-accent-foreground"
                        )}
                        onClick={() => selectStop(name)}
                      >
                        <Check className={cn("h-4 w-4 shrink-0", value === name ? "opacity-100" : "opacity-0")} />
                        <HighlightedName name={name} query={highlighted} />
                      </button>
                    ))}
                    {filteredResults.length > 0 && <div className="my-1 border-t" />}
                  </>
                )}
                {filteredResults.map((name) => (
                  <button
                    key={name}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground",
                      value === name && "bg-accent text-accent-foreground"
                    )}
                    onClick={() => selectStop(name)}
                  >
                    <Check className={cn("h-4 w-4 shrink-0", value === name ? "opacity-100" : "opacity-0")} />
                    <HighlightedName name={name} query={highlighted} />
                  </button>
                ))}
              </>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
