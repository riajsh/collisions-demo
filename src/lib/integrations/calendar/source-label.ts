import "server-only";

type CalendarAccountJoin = {
  email: string;
  users: { full_name: string } | { full_name: string }[] | null;
};

type CalendarEventSourceRow = {
  source_calendar_id: string | null;
  calendar_accounts: CalendarAccountJoin | CalendarAccountJoin[] | null;
};

function resolveUserName(
  users: CalendarAccountJoin["users"],
): string | null {
  if (!users) {
    return null;
  }

  const user = Array.isArray(users) ? users[0] : users;
  const fullName = user?.full_name?.trim();
  return fullName || null;
}

export function formatCalendarSourceLabel(
  row: CalendarEventSourceRow,
): string | null {
  const account = Array.isArray(row.calendar_accounts)
    ? row.calendar_accounts[0]
    : row.calendar_accounts;

  const userName = resolveUserName(account?.users ?? null);
  if (userName) {
    return userName;
  }

  const accountEmail = account?.email?.trim();
  if (accountEmail) {
    return accountEmail;
  }

  const sourceCalendarId = row.source_calendar_id?.trim();
  if (sourceCalendarId && sourceCalendarId !== "primary") {
    return sourceCalendarId;
  }

  return null;
}
