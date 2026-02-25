export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { RRule } from "rrule";

// ✅ Replace this with your DB client.
// If you're using node-postgres, you'd import your pool and use pool.query.
// If you're using Drizzle/Prisma, swap the query bits accordingly.
import { pool } from "@/app/lib/db";

type SeriesRow = {
  id: string;
  calendar_id: string;
  title: string;
  description: string | null;
  dtstart: string; // timestamptz -> ISO string
  duration_minutes: number;
  timezone: string;
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

function toDate(s: string) {
  return new Date(s);
}

function addMinutes(d: Date, minutes: number) {
  return new Date(d.getTime() + minutes * 60_000);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  const calendarId = searchParams.get("calendarId"); // optional filter

  if (!start || !end) {
    return NextResponse.json({ error: "start and end are required" }, { status: 400 });
  }

  const rangeStart = new Date(start);
  const rangeEnd = new Date(end);

  // 1) Load candidate series
  // Series qualifies if:
  // - dtstart <= rangeEnd
  // - until is null OR until >= rangeStart
  const seriesRes = await pool.query<SeriesRow>(
    `
    SELECT *
    FROM calendar_event_series
    WHERE dtstart <= $1
      AND (until IS NULL OR until >= $2)
      ${calendarId ? "AND calendar_id = $3" : ""}
    `,
    calendarId ? [rangeEnd.toISOString(), rangeStart.toISOString(), calendarId] : [rangeEnd.toISOString(), rangeStart.toISOString()]
  );

  const series = seriesRes.rows;
  if (series.length === 0) return NextResponse.json({ events: [] });

  const seriesIds = series.map((s) => s.id);

  // 2) Load overrides + exdates for those series (limit to around our range)
  // We add some padding because an override can move an event into our range.
  const padMs = 7 * 24 * 60 * 60_000;
  const padStart = new Date(rangeStart.getTime() - padMs);
  const padEnd = new Date(rangeEnd.getTime() + padMs);

  const overridesRes = await pool.query<OverrideRow>(
    `
    SELECT series_id, original_start, title, description, start_override, end_override, duration_minutes, all_day
    FROM calendar_event_override
    WHERE series_id = ANY($1)
      AND original_start BETWEEN $2 AND $3
    `,
    [seriesIds, padStart.toISOString(), padEnd.toISOString()]
  );

  const exdatesRes = await pool.query<ExdateRow>(
    `
    SELECT series_id, exdate
    FROM calendar_event_exdate
    WHERE series_id = ANY($1)
      AND exdate BETWEEN $2 AND $3
    `,
    [seriesIds, padStart.toISOString(), padEnd.toISOString()]
  );

  // 3) Index overrides/exdates for fast lookup
  const overridesByKey = new Map<string, OverrideRow>();
  for (const o of overridesRes.rows) {
    // key: seriesId + original_start ISO
    overridesByKey.set(`${o.series_id}:${new Date(o.original_start).toISOString()}`, o);
  }

  const exdateSet = new Set<string>();
  for (const x of exdatesRes.rows) {
    exdateSet.add(`${x.series_id}:${new Date(x.exdate).toISOString()}`);
  }

  // 4) Expand occurrences
  const events: Array<{
    id: string;
    seriesId: string;
    calendarId: string;
    title: string;
    description: string | null;
    start: string;
    end: string;
    allDay: boolean;
  }> = [];

  for (const s of series) {
    const dtstart = toDate(s.dtstart);
    const duration = s.duration_minutes ?? 60;

    // Build list of "original occurrence starts" that should exist
    let occurrenceStarts: Date[] = [];

    if (!s.rrule) {
      occurrenceStarts = [dtstart];
    } else {
      // rrule string should NOT include DTSTART; we set it ourselves.
      // If your rrule strings DO include DTSTART, you can parse fromString and ignore dtstart,
      // but this approach is simpler for your schema.
      const rule = RRule.fromString(s.rrule);
      const ruleWithDtstart = new RRule({
        ...rule.origOptions,
        dtstart,
        // If you store `until` separately, enforce it:
        until: s.until ? toDate(s.until) : rule.origOptions.until,
      });

      occurrenceStarts = ruleWithDtstart.between(rangeStart, rangeEnd, true);
    }

    for (const originalStart of occurrenceStarts) {
      const originalStartIso = originalStart.toISOString();

      // exdate cancels this occurrence
      if (exdateSet.has(`${s.id}:${originalStartIso}`)) continue;

      // base times
      let startTime = originalStart;
      let endTime = addMinutes(originalStart, duration);
      let title = s.title;
      let description = s.description;
      let allDay = false;

      // override (can change title/desc and/or move time)
      const ov = overridesByKey.get(`${s.id}:${originalStartIso}`);
      if (ov) {
        if (ov.title != null) title = ov.title;
        if (ov.description != null) description = ov.description;

        if (ov.start_override) startTime = toDate(ov.start_override);

        if (ov.end_override) {
          endTime = toDate(ov.end_override);
        } else if (ov.duration_minutes != null) {
          endTime = addMinutes(startTime, ov.duration_minutes);
        }

        allDay = ov.all_day ?? false;
      }

      // only include if final (possibly moved) start/end intersects our requested range
      if (endTime < rangeStart || startTime > rangeEnd) continue;

      events.push({
        id: `${s.id}:${originalStartIso}`, // stable occurrence id
        seriesId: s.id,
        calendarId: s.calendar_id,
        title,
        description,
        start: startTime.toISOString(),
        end: endTime.toISOString(),
        allDay,
      });
    }
  }

  // optional sort
  events.sort((a, b) => a.start.localeCompare(b.start));

  return NextResponse.json({ events });
}