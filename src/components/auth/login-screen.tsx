import { signInWithPassword } from "@/app/(auth)/login/actions";
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
  devSeedAccount,
}: LoginScreenProps) {
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
            Enter your email and password to continue.
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

        <form
          action={signInWithPassword}
          className={error ? "mt-5 space-y-3" : "mt-6 space-y-3"}
        >
          <input type="hidden" name="next" value={next ?? ""} />
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
          <Button type="submit" size="lg" className="h-11 w-full text-body font-medium">
            Sign in
          </Button>
        </form>

        {devSeedAccount?.email ? (
          <p className="mt-4 text-center text-caption text-muted-foreground">
            Seed account{" "}
            <span className="font-medium text-foreground">{devSeedAccount.email}</span>{" "}
            / <span className="font-medium text-foreground">password123</span>
          </p>
        ) : null}
      </section>

      <p className="text-center text-caption text-muted-foreground">
        Team access only
      </p>
    </div>
  );
}
