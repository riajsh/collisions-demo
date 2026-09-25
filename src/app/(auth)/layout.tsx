export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-surface-primary px-6 py-12">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
