"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { deleteProfileAction } from "@/app/(app)/profiles/[id]/actions";
import { Button } from "@/components/ui/button";
import { useAppDialog } from "@/components/ui/app-dialog-provider";
import { toastSuccess } from "@/lib/toast";

type DeleteProfileButtonProps = {
  profileId: string;
  profileName: string;
  redirectHref?: string;
  variant?: "default" | "ghost" | "outline";
  size?: "default" | "sm";
  className?: string;
};

export function DeleteProfileButton({
  profileId,
  profileName,
  redirectHref = "/profiles",
  variant = "ghost",
  size = "sm",
  className,
}: DeleteProfileButtonProps) {
  const router = useRouter();
  const { confirm, alert } = useAppDialog();
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    const confirmed = await confirm({
      title: "Delete profile",
      description: `Delete ${profileName}? Their relationship, activities, and tags will be removed. This cannot be undone.`,
      confirmLabel: "Delete profile",
      destructive: true,
    });

    if (!confirmed) {
      return;
    }

    setIsDeleting(true);

    const formData = new FormData();
    formData.set("profileId", profileId);

    try {
      const result = await deleteProfileAction(formData);
      if (result?.error) {
        await alert({ title: "Could not delete profile", description: result.error });
        return;
      }

      toastSuccess("Profile deleted");
      router.push(redirectHref);
      router.refresh();
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      disabled={isDeleting}
      className={className}
      onClick={handleDelete}
    >
      {isDeleting ? "Deleting…" : "Delete"}
    </Button>
  );
}
