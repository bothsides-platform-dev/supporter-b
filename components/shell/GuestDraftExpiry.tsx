"use client";
import { useEffect } from "react";
import { loadGuestDraft } from "@/lib/guest-rfp/draft";

/** Browser-local retention: run on entry, tab return, and while the site is open. */
export function GuestDraftExpiry() {
  useEffect(() => {
    const check = () => {
      try {
        loadGuestDraft();
      } catch {
        /* The draft screen owns storage-error feedback. Keep other pages usable. */
      }
    };
    check();
    const timer = window.setInterval(check, 60_000);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);
  return null;
}
