/// A "week" is always a Monday-starting 7-day window (FR-1), so every part of the
/// app that needs "this week" or "last week" goes through these two functions
/// rather than re-deriving Monday math ad hoc.

export function mondayOf(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export function weekEndOf(weekStart: Date): Date {
  const end = new Date(weekStart);
  end.setUTCDate(end.getUTCDate() + 6);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

export function priorWeekStart(weekStart: Date): Date {
  const prior = new Date(weekStart);
  prior.setUTCDate(prior.getUTCDate() - 7);
  return prior;
}

export function weeksBefore(weekStart: Date, n: number): Date {
  const d = new Date(weekStart);
  d.setUTCDate(d.getUTCDate() - 7 * n);
  return d;
}

export function formatWeekLabel(weekStart: Date): string {
  return weekStart.toISOString().slice(0, 10);
}
