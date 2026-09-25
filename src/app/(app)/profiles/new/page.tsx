import Link from "next/link";

import { PageHeader } from "@/components/app-shell/page-header";
import { CreateProfileForm } from "@/components/profiles/create-profile-form";
import { Button } from "@/components/ui/button";

type NewProfilePageProps = {
  searchParams: Promise<{
    name?: string;
    company?: string;
    email?: string;
  }>;
};

export default async function NewProfilePage({
  searchParams,
}: NewProfilePageProps) {
  const params = await searchParams;

  return (
    <>
      <PageHeader title="New profile">
        <Button asChild variant="outline">
          <Link href="/profiles">Back to profiles</Link>
        </Button>
      </PageHeader>
      <div className="px-8 py-6">
        <CreateProfileForm
          initialValues={{
            fullName: params.name?.trim() || undefined,
            organisationName: params.company?.trim() || undefined,
            email: params.email?.trim() || undefined,
          }}
        />
      </div>
    </>
  );
}
