import { AdminPage } from "@/components/admin/admin-page";
import { CreateTagForm } from "@/components/tags/create-tag-form";
import { TagsTable } from "@/components/tags/tags-table";
import { listOrgTags } from "@/lib/data/tags";

export default async function AdminTagsPage() {
  const tags = await listOrgTags();
  const tagsInUse = tags.filter((tag) => tag.profileCount > 0).length;

  return (
    <AdminPage
      title="Tags"
      description={`${tagsInUse} tags in use · ${tags.length} total`}
    >
      <CreateTagForm />
      <TagsTable
        tags={[...tags].sort(
          (a, b) =>
            b.profileCount - a.profileCount || a.name.localeCompare(b.name),
        )}
      />
    </AdminPage>
  );
}
