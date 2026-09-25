"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ChevronLeft, Plus, X } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { OrgTag } from "@/lib/data/tags";
import type { OrgUser } from "@/lib/data/users";
import { formatEnumLabel } from "@/lib/format/enum";
import type { ProfileCompleteness } from "@/lib/profiles/completeness";
import type { Database } from "@/types/database";

type RelationshipStatus = Database["public"]["Enums"]["relationship_status"];

const STATUS_OPTIONS: RelationshipStatus[] = [
  "prospect",
  "active",
  "partner",
  "advisor",
  "community",
  "dormant",
  "inactive",
];

const COMPLETENESS_OPTIONS: Array<{ value: ProfileCompleteness; label: string }> = [
  { value: "missing-both", label: "Missing company & role" },
  { value: "missing-company", label: "Missing company" },
  { value: "missing-role", label: "Missing role" },
];

type FilterField = "tag" | "owner" | "status" | "company" | "city" | "complete";

const FIELD_LABELS: Record<FilterField, string> = {
  tag: "Tag",
  owner: "Owner",
  status: "Status",
  company: "Company",
  city: "City",
  complete: "Missing data",
};

type ProfilesFilterBarProps = {
  tags: OrgTag[];
  teamUsers: OrgUser[];
  companies: string[];
  cities: string[];
  activeTagId?: string;
  activeOwnerId?: string;
  activeStatus?: string;
  activeCompany?: string;
  activeCity?: string;
  activeComplete?: ProfileCompleteness;
};

function MenuOption({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-md px-2 py-1.5 text-left text-body text-foreground hover:bg-accent"
    >
      {children}
    </button>
  );
}

/**
 * Attio/Notion-style filter bar: only applied filters show, as removable
 * chips, rather than every possible value always sitting on screen
 * (owner/status used to render every option as its own pill regardless of
 * whether it was active, and company/city were separate always-visible
 * dropdowns) — replaces ProfilesListFilters + ProfilesTagFilter +
 * ProfilesCompanyFilter + ProfilesCityFilter with one bar.
 */
export function ProfilesFilterBar({
  tags,
  teamUsers,
  companies,
  cities,
  activeTagId,
  activeOwnerId,
  activeStatus,
  activeCompany,
  activeCity,
  activeComplete,
}: ProfilesFilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [pickingField, setPickingField] = useState<FilterField | null>(null);

  function navigate(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    params.delete("page");
    router.push(params.toString() ? `/profiles?${params.toString()}` : "/profiles");
  }

  function setFilter(field: FilterField, value: string) {
    navigate((params) => params.set(field, value));
    setOpen(false);
    setPickingField(null);
  }

  function removeFilter(field: FilterField) {
    navigate((params) => params.delete(field));
  }

  function clearAll(fields: FilterField[]) {
    navigate((params) => {
      for (const field of fields) {
        params.delete(field);
      }
    });
  }

  const activeChips: Array<{ field: FilterField; label: string }> = [];
  if (activeTagId) {
    const tag = tags.find((item) => item.id === activeTagId);
    activeChips.push({ field: "tag", label: `Tag: ${tag?.name ?? "…"}` });
  }
  if (activeOwnerId) {
    const owner = teamUsers.find((item) => item.id === activeOwnerId);
    activeChips.push({ field: "owner", label: `Owner: ${owner?.fullName ?? "…"}` });
  }
  if (activeStatus) {
    activeChips.push({ field: "status", label: `Status: ${formatEnumLabel(activeStatus)}` });
  }
  if (activeCompany) {
    activeChips.push({ field: "company", label: `Company: ${activeCompany}` });
  }
  if (activeCity) {
    activeChips.push({ field: "city", label: `City: ${activeCity}` });
  }
  if (activeComplete) {
    const option = COMPLETENESS_OPTIONS.find((item) => item.value === activeComplete);
    activeChips.push({ field: "complete", label: option?.label ?? "Missing data" });
  }

  const activeFields = new Set(activeChips.map((chip) => chip.field));
  const availableFields = (
    ["status", "owner", "company", "city", "tag", "complete"] as FilterField[]
  ).filter((field) => !activeFields.has(field));

  return (
    <div className="flex flex-wrap items-center gap-2">
      {activeChips.map((chip) => (
        <span
          key={chip.field}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-caption text-foreground"
        >
          {chip.label}
          <button
            type="button"
            onClick={() => removeFilter(chip.field)}
            aria-label={`Remove ${chip.label} filter`}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}

      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setPickingField(null);
          }
        }}
      >
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="gap-1">
            <Plus className="size-3.5" />
            Add filter
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className={cn("w-56 p-1")}>
          {!pickingField ? (
            <div className="flex flex-col gap-0.5">
              {availableFields.length === 0 ? (
                <p className="px-2 py-1.5 text-caption text-muted-foreground">
                  All filters applied
                </p>
              ) : (
                availableFields.map((field) => (
                  <MenuOption key={field} onClick={() => setPickingField(field)}>
                    {FIELD_LABELS[field]}
                  </MenuOption>
                ))
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              <button
                type="button"
                onClick={() => setPickingField(null)}
                className="mb-1 flex items-center gap-1 px-2 py-1 text-caption text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="size-3" />
                Back
              </button>
              <div className="max-h-64 overflow-y-auto">
                {pickingField === "status" &&
                  STATUS_OPTIONS.map((status) => (
                    <MenuOption key={status} onClick={() => setFilter("status", status)}>
                      {formatEnumLabel(status)}
                    </MenuOption>
                  ))}
                {pickingField === "owner" &&
                  teamUsers.map((user) => (
                    <MenuOption key={user.id} onClick={() => setFilter("owner", user.id)}>
                      {user.fullName}
                    </MenuOption>
                  ))}
                {pickingField === "company" &&
                  (companies.length === 0 ? (
                    <p className="px-2 py-1.5 text-caption text-muted-foreground">
                      No companies yet
                    </p>
                  ) : (
                    companies.map((company) => (
                      <MenuOption key={company} onClick={() => setFilter("company", company)}>
                        {company}
                      </MenuOption>
                    ))
                  ))}
                {pickingField === "city" &&
                  (cities.length === 0 ? (
                    <p className="px-2 py-1.5 text-caption text-muted-foreground">
                      No cities yet
                    </p>
                  ) : (
                    cities.map((city) => (
                      <MenuOption key={city} onClick={() => setFilter("city", city)}>
                        {city}
                      </MenuOption>
                    ))
                  ))}
                {pickingField === "tag" &&
                  (tags.length === 0 ? (
                    <p className="px-2 py-1.5 text-caption text-muted-foreground">
                      No tags yet
                    </p>
                  ) : (
                    tags.map((tag) => (
                      <MenuOption key={tag.id} onClick={() => setFilter("tag", tag.id)}>
                        {tag.name}
                      </MenuOption>
                    ))
                  ))}
                {pickingField === "complete" &&
                  COMPLETENESS_OPTIONS.map((option) => (
                    <MenuOption
                      key={option.value}
                      onClick={() => setFilter("complete", option.value)}
                    >
                      {option.label}
                    </MenuOption>
                  ))}
              </div>
            </div>
          )}
        </PopoverContent>
      </Popover>

      {activeChips.length > 0 ? (
        <button
          type="button"
          onClick={() => clearAll(activeChips.map((chip) => chip.field))}
          className="text-caption text-interactive-primary hover:underline"
        >
          Clear all
        </button>
      ) : null}
    </div>
  );
}
