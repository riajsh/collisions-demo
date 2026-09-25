"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";

export function CalendarConnectButton() {
  return (
    <Button asChild>
      <Link href="/api/auth/google-calendar/connect">Connect Google Calendar</Link>
    </Button>
  );
}
