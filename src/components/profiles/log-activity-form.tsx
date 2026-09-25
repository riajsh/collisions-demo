"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { logActivityAction } from "@/app/(app)/profiles/[id]/actions";
import { Button } from "@/components/ui/button";
import { useAppDialog } from "@/components/ui/app-dialog-provider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { OrgUser } from "@/lib/data/users";
import { formatEnumLabel } from "@/lib/format/enum";
import { toastSuccess } from "@/lib/toast";
import { useAsyncAction } from "@/lib/use-async-action";

const ACTIVITY_TYPES = ["note", "meeting", "introduction"] as const;

const INTRODUCTION_OUTCOMES = [
  "pending",
  "accepted",
  "led_to_meeting",
  "no_response",
] as const;

function defaultDateTimeLocalValue() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

type LogActivityFormProps = {
  profileId: string;
  teamUsers: OrgUser[];
  currentUserId: string;
};

export function LogActivityForm({
  profileId,
  teamUsers,
  currentUserId,
}: LogActivityFormProps) {
  const router = useRouter();
  const { alert } = useAppDialog();
  const { isPending, run } = useAsyncAction();
  const [activityType, setActivityType] = useState<string>("note");
  const [introducedBy, setIntroducedBy] = useState(currentUserId);
  const [introductionOutcome, setIntroductionOutcome] = useState("pending");
  const defaultDate = useMemo(() => defaultDateTimeLocalValue(), []);

  const isIntroduction = activityType === "introduction";

  return (
    <form
      action={(formData) => {
        void run(async () => {
          const result = await logActivityAction(formData);
          if (result.error) {
            await alert({ title: "Could not log activity", description: result.error });
            return;
          }
          toastSuccess("Activity logged");
          router.refresh();
        });
      }}
      className="space-y-4 rounded-lg border border-border bg-card p-4"
    >
      <p className="text-subheading font-medium text-foreground">Log activity</p>
      <input type="hidden" name="profileId" value={profileId} />
      <input type="hidden" name="activityType" value={activityType} />
      {isIntroduction ? (
        <>
          <input type="hidden" name="introducedBy" value={introducedBy} />
          <input
            type="hidden"
            name="introductionOutcome"
            value={introductionOutcome}
          />
        </>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="activity-type">Type</Label>
          <Select value={activityType} onValueChange={setActivityType}>
            <SelectTrigger id="activity-type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACTIVITY_TYPES.map((option) => (
                <SelectItem key={option} value={option}>
                  {formatEnumLabel(option)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="activity-date">When</Label>
          <Input
            id="activity-date"
            name="activityDate"
            type="datetime-local"
            defaultValue={defaultDate}
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="activity-title">Title</Label>
        <Input
          id="activity-title"
          name="title"
          required
          placeholder={
            isIntroduction
              ? "e.g. Introduced to Henry at Acme"
              : activityType === "meeting"
                ? "e.g. Coffee catch-up"
                : "e.g. Follow-up from event"
          }
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="activity-summary">Details (optional)</Label>
        <Textarea
          id="activity-summary"
          name="summary"
          rows={3}
          placeholder="Context, outcomes, next steps…"
        />
      </div>

      {isIntroduction ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="introduced-by">Introduced by</Label>
            <Select value={introducedBy} onValueChange={setIntroducedBy}>
              <SelectTrigger id="introduced-by" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {teamUsers.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="introduction-outcome">Outcome</Label>
            <Select
              value={introductionOutcome}
              onValueChange={setIntroductionOutcome}
            >
              <SelectTrigger id="introduction-outcome" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INTRODUCTION_OUTCOMES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {formatEnumLabel(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : null}

      <Button type="submit" disabled={isPending} className="w-fit">
        {isPending ? "Saving…" : "Log activity"}
      </Button>
    </form>
  );
}
