"use client";

import { useEffect, useRef, useState } from "react";
import { t, type Lang } from "@/lib/i18n";
import { EmptyState } from "@/components/EmptyState";

type Entry = {
  id: string;
  description: string | null;
  hasAudio: boolean;
  durationSec: number | null;
  createdAt: string;
};

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const RECORDING_MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];

function pickSupportedMimeType(): string | null {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") return null;
  for (const mime of RECORDING_MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return "";
}

// Minimal shape of the Web Speech API -- not in TypeScript's DOM lib, and we
// only need enough of it to read live transcripts as the person talks.
type SpeechRecognitionResultLike = { isFinal: boolean; 0: { transcript: string } };
type SpeechRecognitionEventLike = { resultIndex: number; results: ArrayLike<SpeechRecognitionResultLike> };
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

const SPEECH_LANG_BY_UI_LANG: Record<Lang, string> = { en: "en-IN", hi: "hi-IN", kn: "kn-IN" };

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export default function ExtraWorkPanel({ lang }: { lang: Lang }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [description, setDescription] = useState("");
  const [micState, setMicState] = useState<"idle" | "recording" | "recorded" | "unsupported" | "denied">(
    "idle",
  );
  const [seconds, setSeconds] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioBlobRef = useRef<Blob | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalTranscriptRef = useRef("");
  const baseDescriptionRef = useRef("");

  useEffect(() => {
    load();
    return () => {
      stopTimer();
      recognitionRef.current?.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function load() {
    try {
      const res = await fetch("/api/extra-work");
      if (!res.ok) return;
      const json = await res.json();
      setEntries(json.entries ?? []);
    } catch {
      // Silent: this is a secondary panel: the main checklist's own error state
      // already tells the user about connection problems.
    }
  }

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function openModal() {
    setDescription("");
    setError("");
    setMicState("idle");
    setSeconds(0);
    setAudioUrl(null);
    audioBlobRef.current = null;
    setShowModal(true);
  }

  function closeModal() {
    stopTimer();
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setShowModal(false);
  }

  function startTranscription() {
    const SpeechRecognitionCtor = getSpeechRecognitionCtor();
    if (!SpeechRecognitionCtor) return;
    try {
      baseDescriptionRef.current = description.trim() ? `${description.trim()} ` : "";
      finalTranscriptRef.current = "";
      const recognition = new SpeechRecognitionCtor();
      recognition.lang = SPEECH_LANG_BY_UI_LANG[lang];
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onresult = (event) => {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const transcript = result[0].transcript;
          if (result.isFinal) {
            finalTranscriptRef.current += `${transcript} `;
          } else {
            interim += transcript;
          }
        }
        setDescription(`${baseDescriptionRef.current}${finalTranscriptRef.current}${interim}`.trim());
      };
      recognition.onerror = () => {
        // Non-fatal: the recording keeps going either way, and typing/audio
        // playback both still work as a fallback if live transcription fails.
      };
      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      recognitionRef.current = null;
    }
  }

  async function startRecording() {
    const mimeType = pickSupportedMimeType();
    if (mimeType === null) {
      setMicState("unsupported");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        audioBlobRef.current = blob;
        setAudioUrl(URL.createObjectURL(blob));
        setMicState("recorded");
        stream.getTracks().forEach((track) => track.stop());
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setMicState("recording");
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
      startTranscription();
    } catch {
      setMicState("denied");
    }
  }

  function stopRecording() {
    stopTimer();
    mediaRecorderRef.current?.stop();
    recognitionRef.current?.stop();
    recognitionRef.current = null;
  }

  function discardRecording() {
    setAudioUrl(null);
    audioBlobRef.current = null;
    setSeconds(0);
    setMicState("idle");
  }

  async function submit() {
    if (!description.trim() && !audioBlobRef.current) return;
    setSubmitting(true);
    setError("");
    try {
      const form = new FormData();
      if (description.trim()) form.set("description", description.trim());
      if (audioBlobRef.current) {
        const ext = audioBlobRef.current.type.includes("mp4") ? "m4a" : "webm";
        form.set("audio", audioBlobRef.current, `note.${ext}`);
        form.set("duration", String(seconds));
      }
      const res = await fetch("/api/extra-work", { method: "POST", body: form });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || t(lang, "couldNotSave"));
        return;
      }
      const json = await res.json();
      setEntries((prev) => [json.entry, ...prev]);
      closeModal();
    } catch {
      setError(t(lang, "couldNotSave"));
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = (description.trim().length > 0 || micState === "recorded") && !submitting;

  return (
    <div className="px-4 mt-6 max-w-lg mx-auto">
      <div className="bg-white rounded-2xl p-4" style={{ boxShadow: "0 1px 2px rgba(22,19,42,0.06)" }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-extrabold text-brand-darker tracking-tight">
            🎙️ {t(lang, "extraWork")}
          </h2>
          <button
            onClick={openModal}
            className="text-xs bg-brand hover:bg-brand-dark transition-colors text-white font-extrabold uppercase tracking-wide px-3 py-2 rounded-lg active:scale-[0.98]"
          >
            {t(lang, "addExtraWork")}
          </button>
        </div>

        {entries.length === 0 ? (
          <EmptyState title={t(lang, "noExtraWorkToday")} hint={t(lang, "noExtraWorkHint")} compact />
        ) : (
          <ul className="space-y-2">
            {entries.map((entry) => (
              <li key={entry.id} className="bg-brand-surface rounded-xl p-3">
                <div className="flex items-center justify-between text-xs text-brand-ink2 font-semibold mb-1">
                  <span>{formatClock(entry.createdAt)}</span>
                </div>
                {entry.description && <p className="text-brand-darker text-sm">{entry.description}</p>}
                {entry.hasAudio && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs text-brand-ink2 font-semibold whitespace-nowrap">
                      🎤 {t(lang, "voiceNote")}
                      {entry.durationSec ? ` · ${formatTime(entry.durationSec)}` : ""}
                    </span>
                    <audio controls src={`/api/extra-work/${entry.id}/audio`} className="h-8 flex-1" />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5">
            <h2 className="text-xl font-extrabold text-brand-darker mb-1 tracking-tight">
              {t(lang, "addExtraWork")}
            </h2>
            <p className="text-brand-ink2 text-sm mb-4 font-medium">{t(lang, "extraWorkPrompt")}</p>

            {error && (
              <div className="mb-3 rounded-lg bg-brand-critical/10 text-brand-critical px-3 py-2 text-sm font-medium">
                {error}
              </div>
            )}

            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t(lang, "typeWhatYouDid")}
              rows={3}
              className="w-full rounded-xl bg-brand-surface px-4 py-3 mb-4 text-base font-medium resize-none border-2 border-transparent focus:border-brand focus:outline-none transition-colors"
            />

            <div className="mb-4">
              <p className="text-xs font-bold uppercase tracking-wide text-brand-ink2 mb-2">
                {t(lang, "recordVoiceNote")}
              </p>

              {micState === "unsupported" && (
                <p className="text-sm text-brand-ink2">{t(lang, "micNotSupported")}</p>
              )}
              {micState === "denied" && (
                <p className="text-sm text-brand-critical font-medium">{t(lang, "micPermissionDenied")}</p>
              )}

              {(micState === "idle" || micState === "denied") && (
                <button
                  type="button"
                  onClick={startRecording}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-brand/10 text-brand font-extrabold uppercase tracking-wide text-sm hover:bg-brand/15 transition-colors"
                >
                  🎤 {t(lang, "tapToRecord")}
                </button>
              )}

              {micState === "recording" && (
                <div>
                  <p className="text-brand-critical font-bold mb-2 flex items-center gap-2 text-sm">
                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-brand-critical animate-pulse" />
                    {t(lang, "recording")} {formatTime(seconds)}
                  </p>
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-brand-critical text-white font-extrabold uppercase tracking-wide text-sm"
                  >
                    ⏹ {t(lang, "stopRecording")}
                  </button>
                </div>
              )}

              {micState === "recorded" && audioUrl && (
                <div className="space-y-2">
                  <audio controls src={audioUrl} className="w-full" />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={discardRecording}
                      className="flex-1 py-2 rounded-lg bg-brand-surface text-brand-ink2 text-xs font-bold uppercase tracking-wide hover:bg-brand/5 transition-colors"
                    >
                      {t(lang, "removeRecording")}
                    </button>
                    <button
                      type="button"
                      onClick={startRecording}
                      className="flex-1 py-2 rounded-lg bg-brand-surface text-brand-ink2 text-xs font-bold uppercase tracking-wide hover:bg-brand/5 transition-colors"
                    >
                      {t(lang, "reRecord")}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={closeModal}
                className="flex-1 py-3 rounded-xl bg-brand-surface font-bold uppercase tracking-wide text-sm text-brand-ink2 hover:bg-brand/5 transition-colors"
              >
                {t(lang, "cancel")}
              </button>
              <button
                type="button"
                disabled={!canSubmit}
                onClick={submit}
                className="flex-1 py-3 rounded-xl bg-brand hover:bg-brand-dark disabled:opacity-50 text-white font-bold uppercase tracking-wide text-sm transition-colors"
              >
                {submitting ? t(lang, "saving") : t(lang, "submit")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
