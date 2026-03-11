export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { pool } from "@/app/lib/db";

type CalendarRow = { id: string };
type EventRow = { id: string; rrule: string | null };

function errorCode(error: unknown) {
  if (typeof error !== "object" || error === null) return undefined;
  const maybeCode = (error as { code?: unknown }).code;
  return typeof maybeCode === "string" ? maybeCode : undefined;
}

function isMissingTableOrColumn(code?: string) {
  return code === "42P01" || code === "42703";
}

async function resolveCalendarId(userId: string, requestedCalendarId?: string) {
  try {
    if (requestedCalendarId) {
      const selected = await pool.query<CalendarRow>(
        `
        SELECT c.id
        FROM calendar c
        LEFT JOIN calendar_share cs
          ON cs.calendar_id = c.id
        WHERE c.id = $1
          AND (c.user_id = $2 OR cs.user_id = $2)
        LIMIT 1
        `,
        [requestedCalendarId, userId]
      );
      if (selected.rows[0]) return selected.rows[0].id;
    }

    const owned = await pool.query<CalendarRow>(
      `
      SELECT id
      FROM calendar
      WHERE user_id = $1
      ORDER BY id ASC
      LIMIT 1
      `,
      [userId]
    );
    return owned.rows[0]?.id ?? null;
  } catch (error: unknown) {
    if (isMissingTableOrColumn(errorCode(error))) return null;
    throw error;
  }
}

async function canAccessEventSeries(userId: string, seriesId: string) {
  try {
    const result = await pool.query<EventRow>(
      `
      SELECT s.id, s.rrule
      FROM calendar_event_series s
      JOIN calendar c ON c.id = s.calendar_id
      LEFT JOIN calendar_share cs ON cs.calendar_id = c.id
      WHERE s.id = $1
        AND (c.user_id = $2 OR cs.user_id = $2)
      LIMIT 1
      `,
      [seriesId, userId]
    );
    return result.rows[0] ?? null;
  } catch (error: unknown) {
    if (isMissingTableOrColumn(errorCode(error))) {
      const fallback = await pool.query<EventRow>(
        `
        SELECT id, rrule
        FROM calendar_event_series
        WHERE id = $1
        LIMIT 1
        `,
        [seriesId]
      );
      return fallback.rows[0] ?? null;
    }
    throw error;
  }
}

function parseOccurrenceId(occurrenceId: string) {
  const splitAt = occurrenceId.indexOf(":");
  if (splitAt < 1) return null;
  const seriesId = occurrenceId.slice(0, splitAt);
  const originalStart = occurrenceId.slice(splitAt + 1);
  const parsedDate = new Date(originalStart);
  if (!seriesId || Number.isNaN(parsedDate.getTime())) return null;
  return { seriesId, originalStart: parsedDate.toISOString() };
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as {
    title?: string;
    description?: string;
    start?: string;
    end?: string;
    allDay?: boolean;
    calendarId?: string;
    recurrence?: {
      frequency?: "weekly";
      interval?: number;
      byWeekday?: string[];
      until?: string;
    };
  };

  const title = (body.title ?? "").trim();
  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }
  if (!body.start || !body.end) {
    return NextResponse.json({ error: "Start and end are required" }, { status: 400 });
  }

  const start = new Date(body.start);
  const end = new Date(body.end);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return NextResponse.json({ error: "Invalid start or end datetime" }, { status: 400 });
  }
  if (end <= start) {
    return NextResponse.json({ error: "End must be after start" }, { status: 400 });
  }

  const calendarId = await resolveCalendarId(userId, body.calendarId);
  if (!calendarId) {
    return NextResponse.json(
      { error: "No accessible calendar found for this account." },
      { status: 400 }
    );
  }

  const durationMinutes = Math.max(
    1,
    Math.round((end.getTime() - start.getTime()) / 60_000)
  );

  const timezone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Los_Angeles";

  let rrule: string | null = null;
  let until: string | null = null;
  if (body.recurrence?.frequency === "weekly") {
    const validWeekdays = new Set(["MO", "TU", "WE", "TH", "FR", "SA", "SU"]);
    const byWeekday = (body.recurrence.byWeekday ?? []).filter((d) =>
      validWeekdays.has(d)
    );
    const weekdayCode = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"][start.getDay()];
    if (!byWeekday.includes(weekdayCode)) byWeekday.push(weekdayCode);

    const repeatUntil = body.recurrence.until ? new Date(body.recurrence.until) : null;
    if (!repeatUntil || Number.isNaN(repeatUntil.getTime())) {
      return NextResponse.json(
        { error: "Repeat-until date is required for weekly recurrence" },
        { status: 400 }
      );
    }

    const interval = Math.max(1, Number(body.recurrence.interval ?? 1));
    rrule = `FREQ=WEEKLY;INTERVAL=${interval};BYDAY=${byWeekday.join(",")}`;
    until = repeatUntil.toISOString();
  }

  const result = await pool.query<{ id: string }>(
    `
    INSERT INTO calendar_event_series
      (calendar_id, title, description, dtstart, duration_minutes, timezone, rrule, until)
    VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING id
    `,
    [
      calendarId,
      title,
      body.description?.trim() || null,
      start.toISOString(),
      durationMinutes,
      timezone,
      rrule,
      until,
    ]
  );

  return NextResponse.json({ ok: true, id: result.rows[0]?.id }, { status: 201 });
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as {
    occurrenceId?: string;
    deleteMode?: "occurrence" | "series";
  };
  const parsed = body.occurrenceId ? parseOccurrenceId(body.occurrenceId) : null;
  if (!parsed) {
    return NextResponse.json({ error: "Valid occurrenceId is required" }, { status: 400 });
  }

  const series = await canAccessEventSeries(userId, parsed.seriesId);
  if (!series) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  if (body.deleteMode === "series") {
    await pool.query("DELETE FROM calendar_event_series WHERE id = $1", [parsed.seriesId]);
    return NextResponse.json({ ok: true, deleted: "series" });
  }

  if (!series.rrule) {
    await pool.query("DELETE FROM calendar_event_series WHERE id = $1", [parsed.seriesId]);
    return NextResponse.json({ ok: true, deleted: "series" });
  }

  await pool.query(
    `
    INSERT INTO calendar_event_exdate (series_id, exdate)
    VALUES ($1, $2)
    ON CONFLICT DO NOTHING
    `,
    [parsed.seriesId, parsed.originalStart]
  );

  return NextResponse.json({ ok: true, deleted: "occurrence" });
}
