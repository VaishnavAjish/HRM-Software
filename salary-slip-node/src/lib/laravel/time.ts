/**
 * Postgres `time` columns, as PHP hands them to the client.
 *
 * PDO returns a `time` value as the string "09:00:00", and Eloquent applies no
 * cast to shifts.start_time/end_time, so that string is exactly what reaches
 * React. Prisma instead maps @db.Time to a JS Date anchored at 1970-01-01, and
 * JSON.stringify turns that into "1970-01-01T09:00:00.000Z" — the shift list
 * would render times as dates.
 *
 * The clock reading is stored in the UTC components of that Date, so the UTC
 * getters are the correct ones: getHours() would shift the value by the
 * server's timezone offset and silently change every displayed shift.
 */

const pad = (n: number): string => String(n).padStart(2, '0');

/** Date (or a passthrough string) to "HH:MM:SS". */
export function formatTime(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;

  // Already a string: the raw driver or a previous format pass produced it.
  if (typeof value === 'string') return value;

  if (Number.isNaN(value.getTime())) return null;

  return `${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}:${pad(value.getUTCSeconds())}`;
}

/**
 * "09:00" or "09:00:00" to the Date a Prisma @db.Time column expects.
 *
 * The PHP validator accepts H:i, so the seconds component is optional on the
 * way in even though it is always present on the way out.
 */
export function parseTime(value: string): Date {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid time: ${value}`);
  }

  const hours = Number.parseInt(match[1]!, 10);
  const minutes = Number.parseInt(match[2]!, 10);
  const seconds = match[3] ? Number.parseInt(match[3], 10) : 0;

  if (hours > 23 || minutes > 59 || seconds > 59) {
    throw new Error(`Invalid time: ${value}`);
  }

  return new Date(Date.UTC(1970, 0, 1, hours, minutes, seconds));
}

/** Whether a string matches the PHP rule `date_format:H:i`. */
export function isValidTimeOfDay(value: string): boolean {
  try {
    parseTime(value);
    return true;
  } catch {
    return false;
  }
}
