import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { MANAGER_ROLES } from "@/lib/require-role";
import { prisma } from "@/lib/prisma";
import { readExtraWorkAudio } from "@/lib/uploads";

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  webm: "audio/webm",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  wav: "audio/wav",
};

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { id } = await params;
  const entry = await prisma.extraWorkLog.findUnique({ where: { id } });
  if (!entry || !entry.audioFile) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const isManager = (MANAGER_ROLES as string[]).includes(session.role);
  if (!isManager && entry.userId !== session.userId) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  const buffer = await readExtraWorkAudio(entry.audioFile).catch(() => null);
  if (!buffer) {
    return NextResponse.json({ error: "Recording is missing." }, { status: 404 });
  }

  const ext = entry.audioFile.split(".").pop() ?? "webm";
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": CONTENT_TYPE_BY_EXT[ext] ?? "audio/webm",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
