"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { addConnectionAction } from "@/app/(app)/profiles/[id]/actions";
import { Button } from "@/components/ui/button";
import { useAppDialog } from "@/components/ui/app-dialog-provider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ProfilePickerOption } from "@/lib/data/profiles";
import type { OrgUser } from "@/lib/data/users";
import { formatEnumLabel } from "@/lib/format/enum";
import { toastSuccess } from "@/lib/toast";
import { useAsyncAction } from "@/lib/use-async-action";

const CONNECTION_TYPES = [
  "colleague",
  "cofounder",
  "introduced",
  "met_at_event",
  "personal",
  "unknown",
] as const;

const CONNECTION_STRENGTHS = ["strong", "warm", "weak", "unknown"] as const;

type AddConnectionFormProps = {
  profileId: string;
  excludedProfileIds: string[];
  teamUsers: OrgUser[];
  currentUserId: string;
  onSearch: (query: string) => Promise<{
    error?: string;
    results: ProfilePickerOption[];
  }>;
};

export function AddConnectionForm({
  profileId,
  excludedProfileIds,
  teamUsers,
  currentUserId,
  onSearch,
}: AddConnectionFormProps) {
  const router = useRouter();
  const { alert } = useAppDialog();
  const { isPending: isSubmitting, run: runSubmit } = useAsyncAction();
  const { isPending: isSearching, run: runSearch } = useAsyncAction();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProfilePickerOption[]>([]);
  const [selectedProfile, setSelectedProfile] =
    useState<ProfilePickerOption | null>(null);
  const [connectionType, setConnectionType] = useState<string>("unknown");
  const [strength, setStrength] = useState<string>("unknown");
  const [introducedBy, setIntroducedBy] = useState(currentUserId);
  const searchTimeoutRef = useRef<number | null>(null);
  const listboxId = useId();
  const showResults = results.length > 0 && !selectedProfile;

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        window.clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  const isIntroduced = connectionType === "introduced";

  function handleQueryChange(value: string) {
    setQuery(value);
    setSelectedProfile(null);

    if (searchTimeoutRef.current) {
      window.clearTimeout(searchTimeoutRef.current);
    }

    if (value.trim().length < 2) {
      setResults([]);
      return;
    }

    searchTimeoutRef.current = window.setTimeout(() => {
      void runSearch(async () => {
        const response = await onSearch(value);
        if (response.error) {
          await alert({
            title: "Search failed",
            description: response.error,
          });
          return;
        }

        setResults(
          response.results.filter(
            (profile) => !excludedProfileIds.includes(profile.id),
          ),
        );
      });
    }, 250);
  }

  return (
    <form
      action={(formData) => {
        void runSubmit(async () => {
          if (!selectedProfile) {
            await alert({
              title: "Select a profile",
              description: "Choose someone from the search results before adding a connection.",
            });
            return;
          }

          const result = await addConnectionAction(formData);
          if (result.error) {
            await alert({ title: "Could not add connection", description: result.error });
            return;
          }
          toastSuccess("Connection added");
          setQuery("");
          setResults([]);
          setSelectedProfile(null);
          router.refresh();
        });
      }}
      className="space-y-4 rounded-lg border border-border bg-card p-4"
    >
      <p className="text-subheading font-medium text-foreground">
        Add connection
      </p>
      <input type="hidden" name="profileId" value={profileId} />
      <input type="hidden" name="otherProfileId" value={selectedProfile?.id ?? ""} />
      <input type="hidden" name="connectionType" value={connectionType} />
      <input type="hidden" name="strength" value={strength} />
      {isIntroduced ? (
        <input type="hidden" name="introducedBy" value={introducedBy} />
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="connection-search">Search profiles</Label>
        <Input
          id="connection-search"
          role="combobox"
          aria-expanded={showResults}
          aria-controls={listboxId}
          aria-autocomplete="list"
          value={query}
          onChange={(event) => handleQueryChange(event.target.value)}
          placeholder="Name…"
          autoComplete="off"
        />
      </div>

      {selectedProfile ? (
        <p className="text-body text-foreground">
          Selected:{" "}
          <span className="font-medium">{selectedProfile.fullName}</span>
          {selectedProfile.organisationName
            ? ` · ${selectedProfile.organisationName}`
            : ""}
        </p>
      ) : null}

      {showResults ? (
        <ul
          id={listboxId}
          role="listbox"
          className="max-h-48 overflow-auto rounded-md border border-border"
        >
          {results.map((profile) => (
            <li key={profile.id} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={false}
                className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-muted/50"
                onClick={() => {
                  setSelectedProfile(profile);
                  setResults([]);
                }}
              >
                <span className="text-body font-medium text-foreground">
                  {profile.fullName}
                </span>
                {profile.organisationName ? (
                  <span className="text-caption text-muted-foreground">
                    {profile.organisationName}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="connection-type">Type</Label>
          <Select value={connectionType} onValueChange={setConnectionType}>
            <SelectTrigger id="connection-type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONNECTION_TYPES.map((option) => (
                <SelectItem key={option} value={option}>
                  {formatEnumLabel(option)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="connection-strength">Strength</Label>
          <Select value={strength} onValueChange={setStrength}>
            <SelectTrigger id="connection-strength" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONNECTION_STRENGTHS.map((option) => (
                <SelectItem key={option} value={option}>
                  {formatEnumLabel(option)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isIntroduced ? (
        <div className="space-y-2">
          <Label htmlFor="connection-introduced-by">Introduced by</Label>
          <Select value={introducedBy} onValueChange={setIntroducedBy}>
            <SelectTrigger id="connection-introduced-by" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {teamUsers.map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {user.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="connection-notes">Notes (optional)</Label>
        <Textarea id="connection-notes" name="notes" rows={2} />
      </div>

      <Button
        type="submit"
        disabled={isSubmitting || isSearching || !selectedProfile}
        className="w-fit"
      >
        {isSubmitting ? "Adding…" : "Add connection"}
      </Button>
    </form>
  );
}
