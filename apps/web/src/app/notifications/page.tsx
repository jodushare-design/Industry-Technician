import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { listNotifications, markNotificationsRead } from "@itm/api";
import { getSession } from "@itm/next/server";
import { Card, Flash, PageHeader, smallButtonClass } from "@itm/ui";
import { runAction } from "@/lib/action";

export const metadata: Metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

async function markAllAction() {
  "use server";
  await runAction("/account", "web.notifications.markAll", async ({ client }) => {
    await markNotificationsRead(client);
    return "All notifications marked as read.";
  });
}

export default async function NotificationsPage({ searchParams }: PageProps<"/notifications">) {
  const session = await getSession();
  if (!session) redirect("/sign-in?next=/notifications");
  const sp = await searchParams;
  const items = await listNotifications(session.client, 100);
  const unread = items.filter((n) => !n.read_at).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeader title="Notifications" description={unread ? `${unread} unread` : "All caught up"} />
        {unread > 0 && <form action={markAllAction}><button className={smallButtonClass}>Mark all as read</button></form>}
      </div>
      <Flash notice={sp.notice} error={sp.error} />
      {items.length === 0 ? (
        <Card><p className="text-muted">Nothing yet.</p></Card>
      ) : (
        <ul className="divide-y divide-line rounded-2xl bg-surface shadow-card">
          {items.map((n) => (
            <li key={n.id} className={`p-3 ${n.read_at ? "" : "bg-subtle"}`}>
              {n.link ? <Link href={n.link} className="font-medium hover:underline">{n.title}</Link> : <span className="font-medium">{n.title}</span>}
              {n.body && <p className="text-sm text-muted">{n.body}</p>}
              <p className="text-xs text-muted">{new Date(n.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</p>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted">Phone push notifications arrive with the Android app. In-app messages are the official record; we do not send job details by SMS or WhatsApp.</p>
    </div>
  );
}
