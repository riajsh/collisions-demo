"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type ConfirmOptions = {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type AlertOptions = {
  title: string;
  description: string;
  confirmLabel?: string;
};

type DialogRequest =
  | {
      kind: "confirm";
      options: ConfirmOptions;
      resolve: (confirmed: boolean) => void;
    }
  | {
      kind: "alert";
      options: AlertOptions;
      resolve: () => void;
    };

type AppDialogContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  alert: (options: AlertOptions) => Promise<void>;
};

const AppDialogContext = createContext<AppDialogContextValue | null>(null);

export function AppDialogProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<DialogRequest | null>(null);
  const settledRef = useRef(false);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setRequest((current) => {
        if (current) {
          if (current.kind === "confirm") {
            current.resolve(false);
          } else {
            current.resolve();
          }
        }

        settledRef.current = false;
        return { kind: "confirm", options, resolve };
      });
    });
  }, []);

  const alert = useCallback((options: AlertOptions) => {
    return new Promise<void>((resolve) => {
      setRequest((current) => {
        if (current) {
          if (current.kind === "confirm") {
            current.resolve(false);
          } else {
            current.resolve();
          }
        }

        settledRef.current = false;
        return { kind: "alert", options, resolve };
      });
    });
  }, []);

  const value = useMemo(() => ({ confirm, alert }), [confirm, alert]);

  const settle = useCallback((confirmed: boolean) => {
    setRequest((active) => {
      if (!active || settledRef.current) {
        return active;
      }

      settledRef.current = true;

      if (active.kind === "confirm") {
        active.resolve(confirmed);
      } else {
        active.resolve();
      }

      return null;
    });
  }, []);

  return (
    <AppDialogContext.Provider value={value}>
      {children}
      {request ? (
        <AlertDialog
          open
          onOpenChange={(nextOpen) => {
            if (!nextOpen) {
              settle(request.kind === "confirm" ? false : true);
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{request.options.title}</AlertDialogTitle>
              <AlertDialogDescription>
                {request.options.description}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              {request.kind === "confirm" ? (
                <AlertDialogCancel onClick={() => settle(false)}>
                  {request.options.cancelLabel ?? "Cancel"}
                </AlertDialogCancel>
              ) : null}
              <AlertDialogAction
                variant={
                  request.kind === "confirm" && request.options.destructive
                    ? "destructive"
                    : "default"
                }
                onClick={() => settle(true)}
              >
                {request.options.confirmLabel ??
                  (request.kind === "confirm" ? "Continue" : "OK")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </AppDialogContext.Provider>
  );
}

export function useAppDialog() {
  const context = useContext(AppDialogContext);
  if (!context) {
    throw new Error("useAppDialog must be used within AppDialogProvider");
  }
  return context;
}
