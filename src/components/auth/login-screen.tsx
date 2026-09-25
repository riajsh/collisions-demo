import { signInWithGoogle, signInWithPassword } from "@/app/(auth)/login/actions";
import { GoogleIcon } from "@/components/auth/google-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type LoginScreenProps = {
  error?: string;
  next?: string;
  primaryDomain: string | null;
  showDevLogin: boolean;
  devSeedAccount?: { email: string };
};

export function LoginScreen({
  error,
  next,
  primaryDomain,
  showDevLogin,
  devSeedAccount,
}: LoginScreenProps) {
  const domainHint = primaryDomain ? `@${primaryDomain}` : "your work";

  return (
    <div className="flex w-full flex-col items-center gap-8">
      <header className="space-y-2 text-center">
        <p className="text-subheading font-semibold tracking-tight text-foreground">
          Ecosystem
        </p>
        <p className="max-w-xs text-body text-muted-foreground">
          Relationship intelligence for your network.
        </p>
      </header>

      <section className="w-full rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="space-y-1">
          <h1 className="text-heading font-medium text-foreground">Sign in</h1>
          <p className="text-body text-muted-foreground">
            Use {domainHint} Google account to continue.
          </p>
        </div>

        {error ? (
          <p
            className="mt-5 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-body text-destructive"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        <form action={signInWithGoogle} className={error ? "mt-5" : "mt-6"}>
          <input type="hidden" name="next" value={next ?? ""} />
          <Button
            type="submit"
            variant="outline"
            size="lg"
            className="h-11 w-full gap-3 bg-background text-body font-medium"
          >
            <GoogleIcon className="size-5" />
            Continue with Google
          </Button>
        </form>
      </section>

      {showDevLogin ? (
        <details className="w-full rounded-lg border border-dashed border-border bg-muted/30 px-4 py-3 text-caption text-muted-foreground">
          <summary className="cursor-pointer select-none font-medium text-foreground">
            Local development sign-in
          </summary>
          <div className="mt-4 space-y-4 border-t border-border pt-4">
            <p>
              Seed account{" "}
              <span className="font-medium text-foreground">
                {devSeedAccount?.email ?? "see team-members.json"}
              </span>{" "}
              / <span className="font-medium text-foreground">password123</span>
            </p>
            <form action={signInWithPassword} className="space-y-3">
              <Input
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="Email"
                aria-label="Email"
              />
              <Input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="Password"
                aria-label="Password"
              />
              <Button type="submit" variant="secondary" className="w-full">
                Sign in with password
              </Button>
            </form>
          </div>
        </details>
      ) : null}

      <p className="text-center text-caption text-muted-foreground">
        Team access only
      </p>
    </div>
  );
}
