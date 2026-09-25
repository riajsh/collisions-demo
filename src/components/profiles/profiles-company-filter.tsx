"use client";

import { useRouter, useSearchParams } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ProfilesCompanyFilterProps = {
  companies: string[];
  activeCompany?: string;
};

export function ProfilesCompanyFilter({
  companies,
  activeCompany,
}: ProfilesCompanyFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateCompany(value: string) {
    const params = new URLSearchParams(searchParams.toString());

    if (value === "all") {
      params.delete("company");
    } else {
      params.set("company", value);
    }

    params.delete("page");
    router.push(params.toString() ? `/profiles?${params.toString()}` : "/profiles");
  }

  if (companies.length === 0 && !activeCompany) {
    return null;
  }

  const companyOptions =
    activeCompany && !companies.includes(activeCompany)
      ? [activeCompany, ...companies]
      : companies;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-caption text-muted-foreground">Company:</span>
      <Select value={activeCompany ?? "all"} onValueChange={updateCompany}>
        <SelectTrigger size="sm" className="min-w-48">
          <SelectValue placeholder="All companies" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All companies</SelectItem>
          {companyOptions.map((company) => (
            <SelectItem key={company} value={company}>
              {company}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
