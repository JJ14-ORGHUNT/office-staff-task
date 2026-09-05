import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

// Stored outside /public so audio recordings are never served without
// an authenticated route checking who's allowed to hear them.
const UPLOAD_ROOT = path.join(process.cwd(), "var", "uploads", "extra-work");

function safeFilename(id: string, ext: string): string {
  const cleanId = id.replace(/[^a-zA-Z0-9_-]/g, "");
  const cleanExt = ext.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) || "webm";
  return `${cleanId}.${cleanExt}`;
}

export async function saveExtraWorkAudio(id: string, buffer: Buffer, ext: string): Promise<string> {
  await mkdir(UPLOAD_ROOT, { recursive: true });
  const filename = safeFilename(id, ext);
  await writeFile(path.join(UPLOAD_ROOT, filename), buffer);
  return filename;
}

export async function readExtraWorkAudio(filename: string): Promise<Buffer> {
  const cleanName = path.basename(filename);
  return readFile(path.join(UPLOAD_ROOT, cleanName));
}
