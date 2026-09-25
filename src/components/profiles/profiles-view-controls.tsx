"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ProfileGroupKey } from "@/lib/profiles/list-group";
import type { ProfileSortKey, SortOrder } from "@/lib/profiles/list-sort";

const SORT_OPTIONS: Array<{ value: ProfileSortKey; label: string }> = [
  { value: "name", label: "Name" },
  { value: "company", label: "Company" },
  { value: "occupation", label: "Role" },
  { value: "location", label: "Location" },
  { value: "owner", label: "Owner" },
  { value: "status", label: "Status" },
  { value: "strength", label: "Strength" },
  { value: "last_interaction", label: "Last interaction" },
];

const GROUP_OPTIONS: Array<{ value: ProfileGroupKey; label: string }> = [
  { value: "none", label: "No grouping" },
  { value: "company", label: "Company" },
  { value: "status", label: "Status" },
  { value: "owner", label: "Owner" },
];

type ProfilesViewControlsProps = {
  sort: ProfileSortKey;
  order: SortOrder;
  groupBy: ProfileGroupKey;
};

/**
 * Sort and Group by, exposed at the top of the list rather than only as
 * click-to-sort column headers (which already exist — see
 * SortableTableHead in profiles-table.tsx) — this is the same underlying
 * sort, just also reachable without hunting through the table header row.
 * Group by is entirely new (see list-group.ts).
 */
export function ProfilesViewControls({
  sort,
  order,
  groupBy,
}: ProfilesViewControlsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function update(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    params.delete("page");
    router.push(params.toString() ? `/profiles?${params.toString()}` : "/profiles");
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1.5">
        <span className="text-caption text-muted-foreground">Sort</span>
        <Select
          value={sort}
          onValueChange={(value) => update((params) => params.set("sort", value))}
        >
          <SelectTrigger size="sm" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-7"
          aria-label={order === "asc" ? "Switch to descending" : "Switch to ascending"}
          onClick={() =>
            update((params) => params.set("order", order === "asc" ? "desc" : "asc"))
          }
        >
          {order === "asc" ? (
            <ArrowUp className="size-3.5" />
          ) : (
            <ArrowDown className="size-3.5" />
          )}
        </Button>
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-caption text-muted-foreground">Group by</span>
        <Select
          value={groupBy}
          onValueChange={(value) =>
            update((params) => {
              if (value === "none") {
                params.delete("group");
              } else {
                params.set("group", value);
              }
            })
          }
        >
          <SelectTrigger size="sm" className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GROUP_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
