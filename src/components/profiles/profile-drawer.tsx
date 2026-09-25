"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef } from "react";

import { ProfileFullPageLink } from "@/components/profiles/profile-full-page-link";
import { DeleteProfileButton } from "@/components/profiles/delete-profile-button";
import { Button } from "@/components/ui/button";
import { handleFocusTrap } from "@/lib/focus-trap";

type ProfileDrawerProps = {
  profileId: string;
  profileName: string;
  closeHref: string;
  canDelete?: boolean;
  children: React.ReactNode;
};

export function ProfileDrawer({
  profileId,
  profileName,
  closeHref,
  canDelete = true,
  children,
}: ProfileDrawerProps) {
  const router = useRouter();
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    closeButtonRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        router.push(closeHref);
        return;
      }

      if (panelRef.current) {
        handleFocusTrap(panelRef.current, event);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [closeHref, router]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/40 animate-in fade-in-0 duration-200"
        aria-hidden="true"
        onClick={() => router.push(closeHref)}
      />

      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex h-full w-full max-w-2xl flex-col border-l border-border bg-background shadow-xl animate-in slide-in-from-right duration-300"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-6 py-4">
          <div className="min-w-0">
            <p
              id={titleId}
              className="truncate text-subheading font-medium text-foreground"
            >
              {profileName}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ProfileFullPageLink
              profileId={profileId}
              className="text-caption text-interactive-primary hover:underline"
            >
              Open full page
            </ProfileFullPageLink>
            {canDelete ? (
              <DeleteProfileButton
                profileId={profileId}
                profileName={profileName}
                redirectHref={closeHref}
                className="text-destructive hover:text-destructive"
              />
            ) : null}
            <Button
              ref={closeButtonRef}
              type="button"
              variant="ghost"
              onClick={() => router.push(closeHref)}
            >
              Close
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">{children}</div>
      </aside>
    </div>
  );
}
