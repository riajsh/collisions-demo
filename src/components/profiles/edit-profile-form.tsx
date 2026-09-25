"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { updateProfileAction } from "@/app/(app)/profiles/[id]/actions";
import { ProfileDetailField } from "@/components/profiles/profile-detail-field";
import { SuggestedCompanyField } from "@/components/profiles/suggested-company-field";
import { Button } from "@/components/ui/button";
import { useAppDialog } from "@/components/ui/app-dialog-provider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ProfileDetail } from "@/lib/data/profiles";
import type { CompanySuggestion } from "@/lib/enrichment/company-from-email";
import { formatInteractionDate } from "@/lib/format/date";
import { formatLocation } from "@/lib/format/location";
import { formatProfileProvenance } from "@/lib/format/provenance";
import { toastSuccess } from "@/lib/toast";
import { useAsyncAction } from "@/lib/use-async-action";

type EditProfileFormProps = {
  profile: ProfileDetail;
  enrichMode?: boolean;
  companySuggestion?: CompanySuggestion | null;
};

function profileFormState(profile: ProfileDetail) {
  return {
    fullName: profile.fullName,
    email: profile.email ?? "",
    phone: profile.phone ?? "",
    organisationName: profile.organisationName ?? "",
    occupation: profile.occupation ?? "",
    locationCity: profile.locationCity ?? "",
    locationCountry: profile.locationCountry ?? "",
    linkedinUrl: profile.linkedinUrl ?? "",
    websiteUrl: profile.websiteUrl ?? "",
    bio: profile.bio ?? "",
  };
}

export function EditProfileForm({
  profile,
  enrichMode = false,
  companySuggestion = null,
}: EditProfileFormProps) {
  const router = useRouter();
  const { alert } = useAppDialog();
  const { isPending, run } = useAsyncAction();
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState(() => profileFormState(profile));

  function handleCancel() {
    setForm(profileFormState(profile));
    setIsEditing(false);
  }

  const location = formatLocation(profile.locationCity, profile.locationCountry);
  const sourcedFrom = formatProfileProvenance(profile.sources);
  const relationshipCreated = profile.relationship?.createdAt
    ? formatInteractionDate(profile.relationship.createdAt)
    : null;

  // Editable fields only — used to decide whether to show the "+ Add
  // details" prompt. Sourced from / Relationship created are provenance,
  // not something to fill in here.
  const showSuggestedCompany =
    enrichMode && companySuggestion && !profile.organisationName?.trim();
  const editableFields: Array<{ label: string; value: string | null; className?: string; multiline?: boolean }> = [
    { label: "Email", value: profile.email },
    { label: "Phone", value: profile.phone },
    ...(showSuggestedCompany
      ? []
      : [{ label: "Company", value: profile.organisationName }]),
    { label: "Occupation", value: profile.occupation },
    { label: "Location", value: location },
    { label: "LinkedIn", value: profile.linkedinUrl },
    { label: "Website", value: profile.websiteUrl },
    { label: "Bio", value: profile.bio, className: "sm:col-span-2", multiline: true },
  ];
  const populatedFields = editableFields.filter((field) => field.value?.trim());
  const missingCount = editableFields.length - populatedFields.length - (showSuggestedCompany ? 1 : 0);

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      {!isEditing ? (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setForm(profileFormState(profile));
              setIsEditing(true);
            }}
          >
            Edit
          </Button>
        </div>
      ) : null}

      {!isEditing ? (
        <div className="space-y-3">
          <dl className="grid gap-4 sm:grid-cols-2">
            <ProfileDetailField
              label="Full name"
              value={profile.fullName}
              className="sm:col-span-2"
            />
            {showSuggestedCompany ? (
              <SuggestedCompanyField
                profileId={profile.id}
                suggestion={companySuggestion}
                variant="detail"
              />
            ) : null}
            {populatedFields.map((field) => (
              <ProfileDetailField
                key={field.label}
                label={field.label}
                value={field.value}
                className={field.className}
                multiline={field.multiline}
              />
            ))}
            {sourcedFrom ? (
              <ProfileDetailField label="Sourced from" value={sourcedFrom} />
            ) : null}
            {relationshipCreated ? (
              <ProfileDetailField
                label="Relationship created"
                value={relationshipCreated}
              />
            ) : null}
          </dl>
          {missingCount > 0 ? (
            <button
              type="button"
              onClick={() => {
                setForm(profileFormState(profile));
                setIsEditing(true);
              }}
              className="text-caption text-interactive-primary hover:underline"
            >
              + Add {missingCount} more detail{missingCount === 1 ? "" : "s"}
            </button>
          ) : null}
        </div>
      ) : (
        <form
          action={(formData) => {
            void run(async () => {
              const result = await updateProfileAction(formData);
              if (result.error) {
                await alert({ title: "Could not save profile", description: result.error });
                return;
              }
              toastSuccess("Profile saved");
              setIsEditing(false);
              router.refresh();
            });
          }}
          className="space-y-4"
        >
          <input type="hidden" name="profileId" value={profile.id} />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="profile-full-name">Full name</Label>
              <Input
                id="profile-full-name"
                name="fullName"
                value={form.fullName}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    fullName: event.target.value,
                  }))
                }
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="profile-email">Email</Label>
              <Input
                id="profile-email"
                name="email"
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    email: event.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="profile-phone">Phone</Label>
              <Input
                id="profile-phone"
                name="phone"
                value={form.phone}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    phone: event.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="profile-company">Company</Label>
              <Input
                id="profile-company"
                name="organisationName"
                value={form.organisationName}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    organisationName: event.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="profile-occupation">Occupation</Label>
              <Input
                id="profile-occupation"
                name="occupation"
                value={form.occupation}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    occupation: event.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="profile-city">City</Label>
              <Input
                id="profile-city"
                name="locationCity"
                value={form.locationCity}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    locationCity: event.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="profile-country">Country</Label>
              <Input
                id="profile-country"
                name="locationCountry"
                value={form.locationCountry}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    locationCountry: event.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="profile-linkedin">LinkedIn URL</Label>
              <Input
                id="profile-linkedin"
                name="linkedinUrl"
                value={form.linkedinUrl}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    linkedinUrl: event.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="profile-website">Website URL</Label>
              <Input
                id="profile-website"
                name="websiteUrl"
                value={form.websiteUrl}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    websiteUrl: event.target.value,
                  }))
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-bio">Bio</Label>
            <Textarea
              id="profile-bio"
              name="bio"
              rows={3}
              value={form.bio}
              onChange={(event) =>
                setForm((current) => ({ ...current, bio: event.target.value }))
              }
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={isPending} size="sm">
              {isPending ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={handleCancel}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
