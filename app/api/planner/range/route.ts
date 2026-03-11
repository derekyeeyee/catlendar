export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { RRule } from "rrule";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { pool } from "@/app/lib/db";

type SeriesRow = {
  id: string;
  calendar_id: string;
  title: string;
  description: string | null;
  dtstart: string;
  duration_minutes: number;
  rrule: string | null;
  until: string | null;
};

type OverrideRow = {
  series_id: string;
  original_start: string;
  title: string | null;
  description: string | null;
  start_override: string | null;
  end_override: string | null;
  duration_minutes: number | null;
  all_day: boolean;
};

type ExdateRow = {
  series_id: string;
  exdate: string;
};

type TaskRow = {
  id: string;
  title: string;
  due_at: string | null;
  priority: string | null;
  completed_at: string | null;
};

type ReminderRow = {
  id: string;
  remind_at: string;
  event_id: string | null;
  task_id: string | null;
};

type NotificationRow = {
  id: string;
  reminder_id: string;
  sent_at: string | null;
  read_at: string | null;
};

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

function isMissingTableOrColumn(code?: string) {
  return code === "42P01" || code === "42703";
}

function errorCode(error: unknown) {
  if (typeof error !== "object" || error === null) return undefined;
  const maybeCode = (error as { code?: unknown }).code;
  return typeof maybeCode === "string" ? maybeCode : undefined;
}

async function findAccessibleCalendarIds(userId: string) {
  try {
    const result = await pool.query<{ id: string }>(
      `
      SELECT DISTINCT c.id
      FROM calendar c
      LEFT JOIN calendar_share cs
        ON cs.calendar_id = c.id
      WHERE c.user_id = $1 OR cs.user_id = $1
      `,
      [userId]
    );
    return result.rows.map((row) => row.id);
  } catch (error: unknown) {
    if (isMissingTableOrColumn(errorCode(error))) return null;
    throw error;
  }
}

async function loadTasks(userId: string, rangeStartIso: string, rangeEndIso: string) {
  try {
    const tasksResult = await pool.query<TaskRow>(
      `
      SELECT
        t.id,
        t.title,
        t.due_at,
        t.priority,
        tc.completed_at
      FROM task t
      LEFT JOIN LATERAL (
        SELECT completed_at
        FROM task_completion
        WHERE task_id = t.id
          AND user_id = $1
        ORDER BY completed_at DESC
        LIMIT 1
      ) tc ON true
      WHERE t.user_id = $1
        AND t.due_at IS NOT NULL
        AND t.due_at BETWEEN $2 AND $3
      ORDER BY t.due_at ASC
      `,
      [userId, rangeStartIso, rangeEndIso]
    );

    return tasksResult.rows.map((row) => ({
      id: row.id,
      title: row.title,
      dueAt: row.due_at,
      completed: !!row.completed_at,
      priority: row.priority,
      tagNames: [] as string[],
    }));
  } catch (error: unknown) {
    if (isMissingTableOrColumn(errorCode(error))) return [];
    throw error;
  }
}

async function loadReminders(userId: string, rangeStartIso: string, rangeEndIso: string) {
  try {
    const remindersResult = await pool.query<ReminderRow>(
      `
      SELECT id, remind_at, event_id, task_id
      FROM reminder
      WHERE user_id = $1
        AND remind_at BETWEEN $2 AND $3
      ORDER BY remind_at ASC
      `,
      [userId, rangeStartIso, rangeEndIso]
    );
    return remindersResult.rows.map((row) => ({
      id: row.id,
      remindAt: row.remind_at,
      eventId: row.event_id,
      taskId: row.task_id,
    }));
  } catch (error: unknown) {
    if (isMissingTableOrColumn(errorCode(error))) return [];
    throw error;
  }
}

async function loadNotifications(userId: string, rangeStartIso: string, rangeEndIso: string) {
  try {
    const notificationsResult = await pool.query<NotificationRow>(
      `
      SELECT id, reminder_id, sent_at, read_at
      FROM notification
      WHERE user_id = $1
        AND (
          (sent_at IS NOT NULL AND sent_at BETWEEN $2 AND $3)
          OR
          (read_at IS NOT NULL AND read_at BETWEEN $2 AND $3)
        )
      ORDER BY sent_at ASC NULLS LAST, read_at ASC NULLS LAST
      `,
      [userId, rangeStartIso, rangeEndIso]
    );
    return notificationsResult.rows.map((row) => ({
      id: row.id,
      reminderId: row.reminder_id,
      sentAt: row.sent_at,
      readAt: row.read_at,
    }));
  } catch (error: unknown) {
    if (isMissingTableOrColumn(errorCode(error))) return [];
    throw error;
  }
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  const calendarId = searchParams.get("calendarId");

  if (!start || !end) {
    return NextResponse.json({ error: "start and end are required" }, { status: 400 });
  }

  const rangeStart = new Date(start);
  const rangeEnd = new Date(end);
  const rangeStartIso = rangeStart.toISOString();
  const rangeEndIso = rangeEnd.toISOString();

  const accessibleCalendarIds = await findAccessibleCalendarIds(userId);
  if (accessibleCalendarIds && accessibleCalendarIds.length === 0) {
    return NextResponse.json({
      events: [],
      tasks: await loadTasks(userId, rangeStartIso, rangeEndIso),
      reminders: await loadReminders(userId, rangeStartIso, rangeEndIso),
      notifications: await loadNotifications(userId, rangeStartIso, rangeEndIso),
    });
  }

  let seriesRows: SeriesRow[] = [];
  try {
    const params: unknown[] = [rangeEndIso, rangeStartIso];
    const clauses = [
      "dtstart <= $1",
      "(until IS NULL OR until >= $2)",
    ];

    if (calendarId) {
      params.push(calendarId);
      clauses.push(`calendar_id = $${params.length}`);
    } else if (accessibleCalendarIds) {
      params.push(accessibleCalendarIds);
      clauses.push(`calendar_id = ANY($${params.length}::uuid[])`);
    }

    const query = `
      SELECT id, calendar_id, title, description, dtstart, duration_minutes, rrule, until
      FROM calendar_event_series
      WHERE ${clauses.join(" AND ")}
    `;
    const seriesResult = await pool.query<SeriesRow>(query, params);
    seriesRows = seriesResult.rows;
  } catch (error: unknown) {
    if (!isMissingTableOrColumn(errorCode(error))) throw error;
    seriesRows = [];
  }

  const seriesIds = seriesRows.map((series) => series.id);
  const events: Array<{
    id: string;
    seriesId: string;
    calendarId: string;
    title: string;
    description: string | null;
    start: string;
    end: string;
    allDay: boolean;
    participantCount: number;
    tagNames: string[];
    attachmentCount: number;
  }> = [];

  if (seriesIds.length > 0) {
    const padMs = 7 * 24 * 60 * 60_000;
    const paddedStartIso = new Date(rangeStart.getTime() - padMs).toISOString();
    const paddedEndIso = new Date(rangeEnd.getTime() + padMs).toISOString();

    let overrides: OverrideRow[] = [];
    let exdates: ExdateRow[] = [];
    const participantCounts = new Map<string, number>();
    const attachmentCounts = new Map<string, number>();

    try {
      const result = await pool.query<OverrideRow>(
        `
        SELECT series_id, original_start, title, description, start_override, end_override, duration_minutes, all_day
        FROM calendar_event_override
        WHERE series_id = ANY($1)
          AND original_start BETWEEN $2 AND $3
        `,
        [seriesIds, paddedStartIso, paddedEndIso]
      );
      overrides = result.rows;
    } catch (error: unknown) {
      if (!isMissingTableOrColumn(errorCode(error))) throw error;
    }

    try {
      const result = await pool.query<ExdateRow>(
        `
        SELECT series_id, exdate
        FROM calendar_event_exdate
        WHERE series_id = ANY($1)
          AND exdate BETWEEN $2 AND $3
        `,
        [seriesIds, paddedStartIso, paddedEndIso]
      );
      exdates = result.rows;
    } catch (error: unknown) {
      if (!isMissingTableOrColumn(errorCode(error))) throw error;
    }

    try {
      const result = await pool.query<{ event_id: string; participant_count: string }>(
        `
        SELECT event_id, COUNT(*)::text AS participant_count
        FROM event_participant
        WHERE event_id = ANY($1)
        GROUP BY event_id
        `,
        [seriesIds]
      );
      for (const row of result.rows) {
        participantCounts.set(row.event_id, Number(row.participant_count));
      }
    } catch (error: unknown) {
      if (!isMissingTableOrColumn(errorCode(error))) throw error;
    }

    try {
      const result = await pool.query<{ event_id: string; attachment_count: string }>(
        `
        SELECT event_id, COUNT(*)::text AS attachment_count
        FROM attachment
        WHERE event_id = ANY($1)
        GROUP BY event_id
        `,
        [seriesIds]
      );
      for (const row of result.rows) {
        attachmentCounts.set(row.event_id, Number(row.attachment_count));
      }
    } catch (error: unknown) {
      if (!isMissingTableOrColumn(errorCode(error))) throw error;
    }

    const overridesByKey = new Map<string, OverrideRow>();
    for (const override of overrides) {
      const key = `${override.series_id}:${new Date(override.original_start).toISOString()}`;
      overridesByKey.set(key, override);
    }

    const exdateSet = new Set<string>();
    for (const exdate of exdates) {
      exdateSet.add(`${exdate.series_id}:${new Date(exdate.exdate).toISOString()}`);
    }

    for (const series of seriesRows) {
      const dtstart = new Date(series.dtstart);
      const duration = series.duration_minutes ?? 60;
      let occurrenceStarts: Date[] = [];

      if (!series.rrule) {
        occurrenceStarts = [dtstart];
      } else {
        const parsed = RRule.fromString(series.rrule);
        const rule = new RRule({
          ...parsed.origOptions,
          dtstart,
          until: series.until ? new Date(series.until) : parsed.origOptions.until,
        });
        occurrenceStarts = rule.between(rangeStart, rangeEnd, true);
      }

      for (const originalStart of occurrenceStarts) {
        const originalStartIso = originalStart.toISOString();
        if (exdateSet.has(`${series.id}:${originalStartIso}`)) continue;

        let startAt = originalStart;
        let endAt = addMinutes(originalStart, duration);
        let title = series.title;
        let description = series.description;
        let allDay = false;

        const override = overridesByKey.get(`${series.id}:${originalStartIso}`);
        if (override) {
          if (override.title != null) title = override.title;
          if (override.description != null) description = override.description;
          if (override.start_override) startAt = new Date(override.start_override);

          if (override.end_override) {
            endAt = new Date(override.end_override);
          } else if (override.duration_minutes != null) {
            endAt = addMinutes(startAt, override.duration_minutes);
          }
          allDay = !!override.all_day;
        }

        if (endAt < rangeStart || startAt > rangeEnd) continue;

        events.push({
          id: `${series.id}:${originalStartIso}`,
          seriesId: series.id,
          calendarId: series.calendar_id,
          title,
          description,
          start: startAt.toISOString(),
          end: endAt.toISOString(),
          allDay,
          participantCount: participantCounts.get(series.id) ?? 0,
          tagNames: [],
          attachmentCount: attachmentCounts.get(series.id) ?? 0,
        });
      }
    }
  }

  events.sort((a, b) => a.start.localeCompare(b.start));

  const [tasks, reminders, notifications] = await Promise.all([
    loadTasks(userId, rangeStartIso, rangeEndIso),
    loadReminders(userId, rangeStartIso, rangeEndIso),
    loadNotifications(userId, rangeStartIso, rangeEndIso),
  ]);

  return NextResponse.json({ events, tasks, reminders, notifications });
}
