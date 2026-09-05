import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json({ error: "Please enter email and password." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !user.active || !user.passwordHash) {
    return NextResponse.json({ error: "Email or password is not correct." }, { status: 401 });
  }
  if (user.role === "STAFF") {
    return NextResponse.json({ error: "Please use the Staff login." }, { status: 401 });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "Email or password is not correct." }, { status: 401 });
  }

  await createSession({ userId: user.id, name: user.name, role: user.role });
  await logAudit({ userId: user.id, action: "LOGIN", entityType: "User", entityId: user.id });

  return NextResponse.json({ ok: true, role: user.role });
}
