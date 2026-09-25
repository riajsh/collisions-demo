import { LoginScreen } from "@/components/auth/login-screen";
import { getPrimaryLoginDomain } from "@/lib/auth/allowed-email";
import { formatLoginError } from "@/lib/auth/login-errors";
import { getDevSeedAccount } from "@/config/team-members";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
    next?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;

  return (
    <LoginScreen
      error={params.error ? formatLoginError(params.error) : undefined}
      next={params.next}
      primaryDomain={getPrimaryLoginDomain()}
      showDevLogin={process.env.NODE_ENV === "development"}
      devSeedAccount={getDevSeedAccount()}
    />
  );
}
