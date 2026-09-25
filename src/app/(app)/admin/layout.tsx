import { requireAdmin } from "@/lib/auth/session";

// "Sync now" (full-org Eventbrite resync) runs from a page under this
// layout and gets slower as more events get linked and mapped — especially
// now that each event also makes a couple of AI calls for role/company
// splitting and text cleanup. 300s (Vercel's previous default ceiling) was
// no longer enough once Jordan had enough events linked. 800s is the standard
// max on Vercel Pro; if a deploy ever complains this exceeds the plan's
// limit, Fluid Compute needs enabling in Vercel project settings first.
export const maxDuration = 800;

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();

  return <div className="flex min-h-0 flex-1 flex-col">{children}</div>;
}
