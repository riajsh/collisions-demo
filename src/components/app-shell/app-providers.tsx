"use client";

import { AppDialogProvider } from "@/components/ui/app-dialog-provider";
import { Toaster } from "@/components/ui/sonner";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <AppDialogProvider>
      {children}
      <Toaster position="bottom-right" closeButton richColors />
    </AppDialogProvider>
  );
}
