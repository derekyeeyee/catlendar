import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { prisma } from "@/app/lib/prisma";

export async function POST(req: Request) {
  try {
    const { email, password, name } = await req.json();

    const cleanEmail = String(email || "").toLowerCase().trim();
    const cleanPassword = String(password || "");

    if (!cleanEmail || !cleanPassword) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }
    if (cleanPassword.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (existing) {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }

    const hashed = await bcrypt.hash(cleanPassword, 12);

    await prisma.user.create({
      data: { email: cleanEmail, password: hashed, name: name?.trim() || null },
    });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
