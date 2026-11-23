"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { unreadNotificationCount } from "@itm/api";
import { isSupabaseConfigured } from "@itm/next/env";
import { getBrowserSupabase } from "@itm/next/browser";

/** Unread count for the signed-in user, kept live with Realtime. Hidden when signed out. */
export function NotificationBell() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const supabase = getBrowserSupabase();
    let alive = true;
    const load = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return alive && setCount(null);
      try {
        const n = await unreadNotificationCount(supabase);
        if (alive) setCount(n);
      } catch {
        /* ignore: count is a convenience */
      }
    };
    void load();
    const channel = supabase
      .channel("my-notifications")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => void load())
      .subscribe();
    const { data: sub } = supabase.auth.onAuthStateChange(() => void load());
    return () => {
      alive = false;
      void supabase.removeChannel(channel);
      sub.subscription.unsubscribe();
    };
  }, []);

  if (count === null) return null;
  return (
    <Link href="/notifications" className="relative hover:underline" aria-label={`Notifications, ${count} unread`}>
      Notifications
      {count > 0 && (
        <span className="ml-1 inline-flex min-w-5 justify-center rounded-full bg-danger px-1 text-xs font-bold text-on-accent">{count > 99 ? "99+" : count}</span>
      )}
    </Link>
  );
}
