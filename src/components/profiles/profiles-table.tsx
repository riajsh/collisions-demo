"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ProfileListItem } from "@/lib/data/profiles";
import { groupProfiles, type ProfileGroupKey } from "@/lib/profiles/list-group";
import type { ProfileSortKey, SortOrder } from "@/lib/profiles/list-sort";
import { cn } from "@/lib/utils";

import { CalendarSourceCell } from "./calendar-source-cell";
import { InlineStatusCell } from "./inline-status-cell";
import { LastInteractionDateCell } from "./last-interaction-date-cell";
import { LastMeetingCell } from "./last-meeting-cell";
import { OwnerDot } from "./owner-dot";
import { ProfilesBulkActions } from "./profiles-bulk-actions";
import { StrengthBadge } from "./strength-badge";
import { SuggestedCompanyField } from "./suggested-company-field";
import { SuggestedOwnerField } from "./suggested-owner-field";
import type { ProfileEnrichmentSuggestions } from "@/lib/enrichment/profile-enrichment";
import type { OrgUser } from "@/lib/data/users";

const TABLE_COLUMN_COUNT = 12;

type ProfilesTableProps = {
  profiles: ProfileListItem[];
  sort: ProfileSortKey;
  order: SortOrder;
  groupBy?: ProfileGroupKey;
  hasActiveFilters?: boolean;
  canImportProfiles?: boolean;
  enrichMode?: boolean;
  enrichmentByProfileId?: Map<string, ProfileEnrichmentSuggestions>;
  teamUsers?: OrgUser[];
};

type SortableHeadProps = {
  label: string;
  sortKey: ProfileSortKey;
  currentSort: ProfileSortKey;
  currentOrder: SortOrder;
  searchParams: URLSearchParams;
};

function SortableTableHead({
  label,
  sortKey,
  currentSort,
  currentOrder,
  searchParams,
}: SortableHeadProps) {
  const isActive = currentSort === sortKey;
  const nextOrder = isActive && currentOrder === "asc" ? "desc" : "asc";
  const params = new URLSearchParams(searchParams.toString());
  params.set("sort", sortKey);
  params.set("order", nextOrder);
  params.delete("page");

  const SortIcon = isActive
    ? currentOrder === "asc"
      ? ArrowUpIcon
      : ArrowDownIcon
    : ChevronsUpDownIcon;

  return (
    <TableHead>
      <Link
        href={`/profiles?${params.toString()}`}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground",
          isActive ? "text-foreground" : "text-muted-foreground",
        )}
      >
        <span>{label}</span>
        <SortIcon className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="sr-only">
          {isActive
            ? `Sorted ${currentOrder === "asc" ? "ascending" : "descending"}`
            : "Sortable"}
        </span>
      </Link>
    </TableHead>
  );
}

export function ProfilesTable({
  profiles,
  sort,
  order,
  groupBy = "none",
  hasActiveFilters = false,
  canImportProfiles = false,
  enrichMode = false,
  enrichmentByProfileId,
  teamUsers = [],
}: ProfilesTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lastOpenedProfileId = useRef<string | null>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const drawerProfileId = searchParams.get("profile");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const visibleProfileIds = useMemo(
    () => new Set(profiles.map((profile) => profile.id)),
    [profiles],
  );

  const visibleSelectedIds = useMemo(() => {
    const next = new Set<string>();
    for (const profileId of selectedIds) {
      if (visibleProfileIds.has(profileId)) {
        next.add(profileId);
      }
    }
    return next;
  }, [selectedIds, visibleProfileIds]);

  const deletableProfiles = useMemo(
    () => profiles.filter((profile) => profile.canDelete),
    [profiles],
  );

  const groups = useMemo(
    () => groupProfiles(profiles, groupBy),
    [profiles, groupBy],
  );

  const selectedDeletableCount = useMemo(
    () =>
      deletableProfiles.filter((profile) => visibleSelectedIds.has(profile.id))
        .length,
    [deletableProfiles, visibleSelectedIds],
  );

  const allDeletableSelected =
    deletableProfiles.length > 0 &&
    selectedDeletableCount === deletableProfiles.length;

  useEffect(() => {
    if (!selectAllRef.current) {
      return;
    }

    selectAllRef.current.indeterminate =
      selectedDeletableCount > 0 && !allDeletableSelected;
  }, [allDeletableSelected, selectedDeletableCount]);

  useEffect(() => {
    if (drawerProfileId || !lastOpenedProfileId.current) {
      return;
    }

    const row = document.querySelector<HTMLElement>(
      `[data-profile-row="${lastOpenedProfileId.current}"]`,
    );
    row?.focus();
    lastOpenedProfileId.current = null;
  }, [drawerProfileId]);

  function toggleProfile(profileId: string, checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(profileId);
      } else {
        next.delete(profileId);
      }
      return next;
    });
  }

  function toggleAllDeletable(checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const profile of deletableProfiles) {
        if (checked) {
          next.add(profile.id);
        } else {
          next.delete(profile.id);
        }
      }
      return next;
    });
  }

  if (profiles.length === 0) {
    return (
      <EmptyState
        title={hasActiveFilters ? "No profiles match these filters" : "No profiles yet"}
        description={
          hasActiveFilters
            ? "Try clearing filters or broadening your search."
            : "Import a CSV or add profiles manually to start building your network."
        }
      >
        <div className="flex flex-wrap justify-center gap-3">
          {hasActiveFilters ? (
            <Button asChild variant="outline">
              <Link href="/profiles">Clear filters</Link>
            </Button>
          ) : null}
          {canImportProfiles ? (
            <Button asChild variant="outline">
              <Link href="/profiles/import">Import profiles</Link>
            </Button>
          ) : null}
          <Button asChild>
            <Link href="/profiles/new">New profile</Link>
          </Button>
        </div>
      </EmptyState>
    );
  }

  function openProfile(profileId: string) {
    lastOpenedProfileId.current = profileId;
    const params = new URLSearchParams(searchParams.toString());
    params.set("profile", profileId);
    router.push(`/profiles?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ProfilesBulkActions
        profiles={profiles}
        selectedIds={visibleSelectedIds}
        onClearSelection={() => setSelectedIds(new Set())}
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card">
        <div className="min-h-0 flex-1 overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card [&_tr]:border-b [&_tr]:shadow-[inset_0_-1px_0_var(--color-border-default)]">
              <TableRow>
                <TableHead className="w-10">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    role="checkbox"
                    className="size-4 rounded border"
                    aria-label="Select all deletable profiles on this page"
                    checked={allDeletableSelected}
                    disabled={deletableProfiles.length === 0}
                    onChange={(event) => {
                      toggleAllDeletable(event.target.checked);
                    }}
                  />
                </TableHead>
                <SortableTableHead
                  label="Name"
                  sortKey="name"
                  currentSort={sort}
                  currentOrder={order}
                  searchParams={searchParams}
                />
                <SortableTableHead
                  label="Company"
                  sortKey="company"
                  currentSort={sort}
                  currentOrder={order}
                  searchParams={searchParams}
                />
                <SortableTableHead
                  label="Occupation"
                  sortKey="occupation"
                  currentSort={sort}
                  currentOrder={order}
                  searchParams={searchParams}
                />
                <SortableTableHead
                  label="Location"
                  sortKey="location"
                  currentSort={sort}
                  currentOrder={order}
                  searchParams={searchParams}
                />
                <SortableTableHead
                  label="Primary owner"
                  sortKey="owner"
                  currentSort={sort}
                  currentOrder={order}
                  searchParams={searchParams}
                />
                <SortableTableHead
                  label="Status"
                  sortKey="status"
                  currentSort={sort}
                  currentOrder={order}
                  searchParams={searchParams}
                />
                <SortableTableHead
                  label="Strength"
                  sortKey="strength"
                  currentSort={sort}
                  currentOrder={order}
                  searchParams={searchParams}
                />
                <SortableTableHead
                  label="Last interaction"
                  sortKey="last_interaction"
                  currentSort={sort}
                  currentOrder={order}
                  searchParams={searchParams}
                />
                <TableHead>Last meeting</TableHead>
                <TableHead>Calendar</TableHead>
                <TableHead>Tags</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((group) => (
                <Fragment key={group.key}>
                  {group.label ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell
                        colSpan={TABLE_COLUMN_COUNT}
                        className="bg-muted/40 py-1.5 text-caption font-medium text-muted-foreground"
                      >
                        {group.label}{" "}
                        <span className="font-normal">({group.profiles.length})</span>
                      </TableCell>
                    </TableRow>
                  ) : null}
                  {group.profiles.map((profile) => {
                    const isSelected = visibleSelectedIds.has(profile.id);
                    const suggestions = enrichmentByProfileId?.get(profile.id);
                    const showSuggestedCompany =
                      enrichMode &&
                      !profile.organisationName?.trim() &&
                      suggestions?.company;
                    const showSuggestedOwner =
                      enrichMode && !profile.primaryOwner && suggestions?.owner;

                    return (
                      <TableRow
                    key={profile.id}
                    data-profile-row={profile.id}
                    tabIndex={0}
                    role="button"
                    aria-label={`Open profile for ${profile.fullName}`}
                    data-state={isSelected ? "selected" : undefined}
                    className={cn(
                      "cursor-pointer hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                      isSelected && "bg-muted/30",
                    )}
                    onClick={() => openProfile(profile.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openProfile(profile.id);
                      }
                    }}
                  >
                    <TableCell
                      className="w-10"
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        role="checkbox"
                        className="size-4 rounded border"
                        aria-label={`Select ${profile.fullName}`}
                        checked={isSelected}
                        disabled={!profile.canDelete}
                        title={
                          profile.canDelete
                            ? undefined
                            : "Team member profiles cannot be deleted"
                        }
                        onChange={(event) => {
                          toggleProfile(profile.id, event.target.checked);
                        }}
                      />
                    </TableCell>
                    <TableCell className="font-medium text-foreground">
                      {profile.fullName}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {showSuggestedCompany ? (
                        <SuggestedCompanyField
                          profileId={profile.id}
                          suggestion={suggestions.company!}
                          variant="table"
                        />
                      ) : (
                        profile.organisationName ?? "—"
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {profile.occupation ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {profile.location ?? "—"}
                    </TableCell>
                    <TableCell>
                      {showSuggestedOwner ? (
                        <SuggestedOwnerField
                          profileId={profile.id}
                          suggestion={suggestions.owner!}
                          teamUsers={teamUsers}
                          variant="table"
                        />
                      ) : profile.primaryOwner ? (
                        <span className="inline-flex items-center gap-2">
                          <OwnerDot userId={profile.primaryOwner.userId} />
                          <span>{profile.primaryOwner.fullName}</span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <InlineStatusCell
                        profileId={profile.id}
                        status={profile.relationshipStatus}
                      />
                    </TableCell>
                    <TableCell>
                      <StrengthBadge strength={profile.strength} />
                    </TableCell>
                    <TableCell>
                      <LastInteractionDateCell profile={profile} />
                    </TableCell>
                    <TableCell>
                      <LastMeetingCell profile={profile} />
                    </TableCell>
                    <TableCell>
                      <CalendarSourceCell profile={profile} />
                    </TableCell>
                    <TableCell>
                      {profile.tags.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {profile.tags.map((tag) => (
                            <Badge key={tag.id} variant="secondary">
                              {tag.name}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                      </TableRow>
                    );
                  })}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
