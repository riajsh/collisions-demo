"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

type ProfileFullPageLinkProps = {
  profileId: string;
  className?: string;
  children: React.ReactNode;
};

export function ProfileFullPageLink({
  profileId,
  className,
  children,
}: ProfileFullPageLinkProps) {
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab");
  const href =
    tab && tab !== "activity"
      ? `/profiles/${profileId}?tab=${encodeURIComponent(tab)}`
      : `/profiles/${profileId}`;

  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
