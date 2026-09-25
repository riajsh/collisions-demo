import { AdminSubNav } from "@/components/admin/admin-subnav";
import { PageHeader } from "@/components/app-shell/page-header";
import { cn } from "@/lib/utils";

type AdminPageProps = {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  contentClassName?: string;
};

export function AdminPage({
  title,
  description,
  actions,
  children,
  contentClassName = "space-y-6 px-8 py-6",
}: AdminPageProps) {
  return (
    <>
      <div className="sticky top-0 z-20 shrink-0 bg-background">
        <PageHeader title={title} description={description}>
          {actions}
        </PageHeader>
        <AdminSubNav />
      </div>
      <div className={cn(contentClassName)}>{children}</div>
    </>
  );
}
