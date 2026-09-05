import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { MANAGER_ROLES } from "@/lib/require-role";
import { prisma } from "@/lib/prisma";
import { saveExtraWorkAudio } from "@/lib/uploads";
import { logAudit } from "@/lib/audit";
import { todayStr } from "@/lib/tasks";

const EXT_BY_MIME: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
};

const MAX_AUDIO_BYTES = 8 * 1024 * 1024; // 8MB is generous for a short voice note

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const isManager = (MANAGER_ROLES as string[]).includes(session.role);
  const from = searchParams.get("from") || todayStr();
  const to = searchParams.get("to") || from;

  const logs = await prisma.extraWorkLog.findMany({
    where: {
      date: { gte: from, lte: to },
      ...(isManager ? {} : { userId: session.userId }),
    },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    entries: logs.map((l) => ({
      id: l.id,
      date: l.date,
      description: l.description,
      hasAudio: !!l.audioFile,
      durationSec: l.durationSec,
      createdAt: l.createdAt,
      employee: l.user.name,
      employeeId: l.user.id,
    })),
  });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const description = (form.get("description") as string | null)?.trim() || null;
  const audio = form.get("audio");
  const durationRaw = form.get("duration");
  const durationSec = typeof durationRaw === "string" && durationRaw ? Math.round(Number(durationRaw)) : null;

  const hasAudio = audio instanceof File && audio.size > 0;

  if (!description && !hasAudio) {
    return NextResponse.json(
      { error: "Please type what you did, or record a voice note." },
      { status: 400 },
    );
  }

  if (hasAudio && (audio as File).size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "Recording is too long." }, { status: 400 });
  }

  const entry = await prisma.extraWorkLog.create({
    data: {
      userId: session.userId,
      date: todayStr(),
      description,
      durationSec,
    },
  });

  if (hasAudio) {
    const file = audio as File;
    const ext = EXT_BY_MIME[file.type] ?? "webm";
    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = await saveExtraWorkAudio(entry.id, buffer, ext);
    await prisma.extraWorkLog.update({ where: { id: entry.id }, data: { audioFile: filename } });
  }

  await logAudit({
    userId: session.userId,
    action: "EXTRA_WORK_LOGGED",
    entityType: "ExtraWorkLog",
    entityId: entry.id,
    detail: description ?? "(voice note)",
  });

  return NextResponse.json({
    ok: true,
    entry: {
      id: entry.id,
      date: entry.date,
      description: entry.description,
      hasAudio,
      durationSec: entry.durationSec,
      createdAt: entry.createdAt,
      employee: session.name,
      employeeId: session.userId,
    },
  });
}
