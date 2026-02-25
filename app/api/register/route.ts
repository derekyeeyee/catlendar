export const runtime = "nodejs";

import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { pool } from "@/app/lib/db";

export async function POST(req: Request) {
  try {
    const { email, password, name } = await req.json();

    const cleanEmail = String(email || "").toLowerCase().trim();
    if (!cleanEmail || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }

    const existing = await pool.query("SELECT 1 FROM users WHERE email=$1", [cleanEmail]);
    if (existing.rowCount) {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }

    const hashed = await bcrypt.hash(String(password), 12);

    await pool.query(
      "INSERT INTO users (email, password, name) VALUES ($1, $2, $3)",
      [cleanEmail, hashed, name ?? null]
    );

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e: any) {
    console.error("REGISTER ERROR:", e);
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}