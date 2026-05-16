"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { searchStops } from "@/app/actions/query-trips";

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
}

export function StopSelector({ label, value, onChange }: StopSelectorProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [highlighted, setHighlighted] = React.useState("");
  const [results, setResults] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (!open) return;
    const trimmed = search.trim();
    const controller = new AbortController();
    searchStops(trimmed).then((names) => {
      if (!controller.signal.aborted) {
        setHighlighted(trimmed);
        setResults(names);
      }
    });
    return () => controller.abort();
  }, [search, open]);

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
            {results.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Intet fundet.</p>
            ) : (
              results.map((name) => (
                <button
                  key={name}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground",
                    value === name && "bg-accent text-accent-foreground"
                  )}
                  onClick={() => {
                    onChange(name);
                    setSearch("");
                    setOpen(false);
                  }}
                >
                  <Check className={cn("h-4 w-4 shrink-0", value === name ? "opacity-100" : "opacity-0")} />
                  <HighlightedName name={name} query={highlighted} />
                </button>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
