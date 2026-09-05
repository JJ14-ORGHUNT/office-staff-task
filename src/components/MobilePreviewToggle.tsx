"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";

const FRAME_WIDTH = 390;
const FRAME_HEIGHT = 844;

export default function MobilePreviewToggle() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Preview mobile view"
        className="hidden md:flex fixed bottom-4 right-4 z-50 items-center gap-2 rounded-full bg-brand px-4 py-3 text-sm font-extrabold uppercase tracking-wide text-white shadow-lg hover:bg-brand-dark active:scale-95 transition"
      >
        📱 <span>Mobile view</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[60] hidden md:flex flex-col items-center justify-center gap-4 bg-black/60 px-4 py-6"
          onClick={() => setOpen(false)}
        >
          <div className="flex w-full max-w-[390px] items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wide text-white/80">
              Mobile preview · {pathname}
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close mobile preview"
              className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-extrabold uppercase tracking-wide text-white hover:bg-white/20"
            >
              ✕ Close
            </button>
          </div>

          <div
            onClick={(e) => e.stopPropagation()}
            className="overflow-hidden rounded-[2.5rem] border-8 border-brand-darker bg-black shadow-2xl"
            style={{ width: FRAME_WIDTH, height: FRAME_HEIGHT, maxHeight: "80vh", maxWidth: "90vw" }}
          >
            <iframe
              key={pathname}
              src={pathname}
              title="Mobile preview"
              className="h-full w-full border-0 bg-white"
            />
          </div>
        </div>
      )}
    </>
  );
}
