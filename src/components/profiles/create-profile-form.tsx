"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { createProfileAction } from "@/app/(app)/profiles/new/actions";
import { Button } from "@/components/ui/button";
import { useAppDialog } from "@/components/ui/app-dialog-provider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toastSuccess } from "@/lib/toast";
import { useAsyncAction } from "@/lib/use-async-action";

type CreateProfileFormProps = {
  initialValues?: {
    fullName?: string;
    organisationName?: string;
    email?: string;
  };
};

export function CreateProfileForm({ initialValues }: CreateProfileFormProps) {
  const router = useRouter();
  const { alert } = useAppDialog();
  const { isPending, run } = useAsyncAction();
  const [fullName, setFullName] = useState(initialValues?.fullName ?? "");
  const [email, setEmail] = useState(initialValues?.email ?? "");
  const [phone, setPhone] = useState("");
  const [organisationName, setOrganisationName] = useState(
    initialValues?.organisationName ?? "",
  );
  const [occupation, setOccupation] = useState("");
  const [locationCity, setLocationCity] = useState("");
  const [locationCountry, setLocationCountry] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [bio, setBio] = useState("");

  return (
    <form
      action={(formData) => {
        void run(async () => {
          const result = await createProfileAction(formData);
          if (result.error) {
            await alert({ title: "Could not create profile", description: result.error });
            return;
          }
          toastSuccess("Profile created");
          if (result.profileId) {
            router.push(`/profiles/${result.profileId}`);
          }
        });
      }}
      className="max-w-3xl space-y-4 rounded-lg border border-border bg-card p-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="create-full-name">Full name</Label>
          <Input
            id="create-full-name"
            name="fullName"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="create-email">Email</Label>
          <Input
            id="create-email"
            name="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="create-phone">Phone</Label>
          <Input
            id="create-phone"
            name="phone"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="create-company">Company</Label>
          <Input
            id="create-company"
            name="organisationName"
            value={organisationName}
            onChange={(event) => setOrganisationName(event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="create-occupation">Occupation</Label>
          <Input
            id="create-occupation"
            name="occupation"
            value={occupation}
            onChange={(event) => setOccupation(event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="create-city">City</Label>
          <Input
            id="create-city"
            name="locationCity"
            value={locationCity}
            onChange={(event) => setLocationCity(event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="create-country">Country</Label>
          <Input
            id="create-country"
            name="locationCountry"
            value={locationCountry}
            onChange={(event) => setLocationCountry(event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="create-linkedin">LinkedIn URL</Label>
          <Input
            id="create-linkedin"
            name="linkedinUrl"
            value={linkedinUrl}
            onChange={(event) => setLinkedinUrl(event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="create-website">Website URL</Label>
          <Input
            id="create-website"
            name="websiteUrl"
            value={websiteUrl}
            onChange={(event) => setWebsiteUrl(event.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="create-bio">Bio</Label>
        <Textarea
          id="create-bio"
          name="bio"
          rows={3}
          value={bio}
          onChange={(event) => setBio(event.target.value)}
        />
      </div>

      <Button type="submit" disabled={isPending || !fullName.trim()}>
        {isPending ? "Creating…" : "Create profile"}
      </Button>
    </form>
  );
}