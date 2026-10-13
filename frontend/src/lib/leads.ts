export const statuses = ["New", "Contacted", "Qualified", "Proposal Sent", "Won", "Lost"] as const;
export type Status = (typeof statuses)[number];

export type Lead = {
  id: number;
  name: string;
  company: string | null;
  phone: string | null;
  status: Status;
  follow_up_at: string | null;
  created_at: string;
  last_note: string | null;
  last_discussion_at: string | null;
};

export type Discussion = {
  id: number;
  lead_id: number;
  note: string;
  follow_up_at: string | null;
  created_at: string;
};

export function isToday(value: string, now: Date) {
  const date = new Date(value);
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

export function groupLeads(leads: Lead[], query: string, status: Status | "All", now: Date) {
  const matching = leads.filter(lead => lead.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
    && (status === "All" || lead.status === status));
  const today = matching.filter(lead => lead.follow_up_at && isToday(lead.follow_up_at, now))
    .sort((a, b) => Date.parse(a.follow_up_at!) - Date.parse(b.follow_up_at!) || a.id - b.id);
  const pinned = new Set(today.map(lead => lead.id));
  const remaining = matching.filter(lead => !pinned.has(lead.id)).sort((a, b) =>
    Date.parse(b.last_discussion_at || b.created_at) - Date.parse(a.last_discussion_at || a.created_at)
    || b.id - a.id);
  return { today, remaining };
}

export function timeAgo(value: string, now: Date) {
  const seconds = Math.max(0, Math.floor((now.getTime() - Date.parse(value)) / 1000));
  if (seconds < 60) return "Just now";
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (seconds < 3600) return formatter.format(-Math.floor(seconds / 60), "minute");
  if (seconds < 86400) return formatter.format(-Math.floor(seconds / 3600), "hour");
  return formatter.format(-Math.floor(seconds / 86400), "day");
}

export function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" });
}

export function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" });
}
