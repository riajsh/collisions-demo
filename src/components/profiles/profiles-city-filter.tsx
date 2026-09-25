"use client";

import { useRouter, useSearchParams } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ProfilesCityFilterProps = {
  cities: string[];
  activeCity?: string;
};

export function ProfilesCityFilter({
  cities,
  activeCity,
}: ProfilesCityFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateCity(value: string) {
    const params = new URLSearchParams(searchParams.toString());

    if (value === "all") {
      params.delete("city");
    } else {
      params.set("city", value);
    }

    params.delete("page");
    router.push(params.toString() ? `/profiles?${params.toString()}` : "/profiles");
  }

  if (cities.length === 0 && !activeCity) {
    return null;
  }

  const cityOptions =
    activeCity && !cities.includes(activeCity)
      ? [activeCity, ...cities]
      : cities;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-caption text-muted-foreground">City:</span>
      <Select value={activeCity ?? "all"} onValueChange={updateCity}>
        <SelectTrigger size="sm" className="min-w-48">
          <SelectValue placeholder="All cities" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All cities</SelectItem>
          {cityOptions.map((city) => (
            <SelectItem key={city} value={city}>
              {city}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
