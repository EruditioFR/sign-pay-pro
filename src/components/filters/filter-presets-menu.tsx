/**
 * Generic presets menu for any filter bar.
 *
 * Lets the user save the current filter snapshot under a name, recall it
 * later, and delete entries. Storage is local to the browser via
 * `useFilterPresets`.
 */

import * as React from "react";
import { Bookmark, BookmarkPlus, Check, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useFilterPresets } from "@/lib/filter-presets";

interface Props<T> {
  scope: string;
  current: T;
  /** Called when user applies a preset; receives the stored value. */
  onApply: (value: T) => void;
  /** Optional equality function to mark the active preset. */
  isEqual?: (a: T, b: T) => boolean;
  /** Disable the "save" action (e.g. when the value is empty). */
  canSave?: boolean;
  saveLabel?: string;
  emptyLabel?: string;
  buttonLabel?: string;
}

export function FilterPresetsMenu<T>({
  scope,
  current,
  onApply,
  isEqual,
  canSave = true,
  saveLabel = "Enregistrer ce filtre",
  emptyLabel = "Aucun filtre enregistré.",
  buttonLabel = "Filtres enregistrés",
}: Props<T>) {
  const { list, save, remove } = useFilterPresets<T>(scope);
  const [name, setName] = React.useState("");
  const [open, setOpen] = React.useState(false);

  const handleSave = () => {
    if (!canSave || !name.trim()) return;
    save(name, current);
    setName("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" aria-label={buttonLabel}>
          <Bookmark className="mr-1 h-4 w-4" />
          {list.length > 0 ? `${buttonLabel} (${list.length})` : buttonLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[300px] p-3">
        <div className="space-y-3 text-sm">
          <div className="flex gap-1.5">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nom du filtre…"
              className="h-8"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
              }}
            />
            <Button
              size="sm"
              variant="secondary"
              onClick={handleSave}
              disabled={!canSave || !name.trim()}
              title={saveLabel}
            >
              <BookmarkPlus className="h-4 w-4" />
            </Button>
          </div>

          <div className="border-t pt-2">
            {list.length === 0 ? (
              <p className="text-xs text-muted-foreground">{emptyLabel}</p>
            ) : (
              <ul className="space-y-1 max-h-[260px] overflow-y-auto">
                {list.map((p) => {
                  const active = isEqual ? isEqual(p.value, current) : false;
                  return (
                    <li
                      key={p.id}
                      className="flex items-center gap-1 rounded hover:bg-muted/60"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onApply(p.value);
                          setOpen(false);
                        }}
                        className="flex-1 truncate px-2 py-1 text-left text-xs"
                      >
                        <span className="inline-flex items-center gap-1">
                          {active && (
                            <Check className="h-3 w-3 text-primary" />
                          )}
                          {p.name}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(p.id)}
                        className="rounded p-1 text-muted-foreground hover:text-destructive"
                        aria-label="Supprimer"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
