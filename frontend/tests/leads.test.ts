import assert from "node:assert/strict";
import { test } from "node:test";
import { groupLeads, isOverdue, isToday, timeAgo, type Lead } from "../src/lib/leads.ts";

const now = new Date(2026, 9, 13, 14, 0);
const at = (day: number, hour: number) => new Date(2026, 9, day, hour).toISOString();
const lead = (id: number, fields: Partial<Lead> = {}): Lead => ({
  id, name: `Lead ${id}`, company: null, phone: null, status: "New",
  follow_up_at: null, created_at: at(10, 10), last_note: null, last_discussion_at: null, ...fields,
});

test("today is a local calendar day, including both midnight boundaries", () => {
  assert.equal(isToday(at(13, 0), now), true);
  assert.equal(isToday(new Date(2026, 9, 13, 23, 59, 59).toISOString(), now), true);
  assert.equal(isToday(new Date(2026, 9, 12, 23, 59, 59).toISOString(), now), false);
  assert.equal(isToday(at(14, 0), now), false);
});

test("today is pinned once, ordered by time, with today's overdue items included", () => {
  const leads = [lead(1, { follow_up_at: at(13, 16) }), lead(2, { follow_up_at: at(12, 10) }),
    lead(3, { follow_up_at: at(13, 9) }), lead(4, { follow_up_at: at(14, 10) })];
  const groups = groupLeads(leads, "", "All", now);
  assert.deepEqual(groups.today.map(l => l.id), [3, 1]);
  assert.deepEqual(groups.remaining.map(l => l.id), [4, 2]);
  assert.equal(new Set([...groups.today, ...groups.remaining].map(l => l.id)).size, leads.length);
  assert.deepEqual(leads.map(l => l.id), [1, 2, 3, 4]);
});

test("search and every status filter apply to both sections", () => {
  const leads = [lead(1, { name: "Alex Morgan", status: "Won", follow_up_at: at(13, 10) }),
    lead(2, { name: "alex shah", status: "Won" }), lead(3, { name: "Alex Smith", status: "Lost" })];
  const groups = groupLeads(leads, "  ALEX  ", "Won", now);
  assert.deepEqual(groups.today.map(l => l.id), [1]);
  assert.deepEqual(groups.remaining.map(l => l.id), [2]);
  for (const status of ["New", "Contacted", "Qualified", "Proposal Sent", "Won", "Lost"] as const) {
    const result = groupLeads([lead(1, { status })], "", status, now);
    assert.equal(result.remaining.length, 1);
  }
});

test("activity sorting falls back to creation time and resolves ties", () => {
  const groups = groupLeads([lead(1), lead(2), lead(3, { last_discussion_at: at(12, 10) })], "", "All", now);
  assert.deepEqual(groups.remaining.map(l => l.id), [3, 2, 1]);
});

test("crossing midnight moves yesterday's pinned lead out of today's section", () => {
  const leads = [lead(1, { follow_up_at: at(13, 16) }), lead(2, { follow_up_at: at(14, 9) })];
  assert.deepEqual(groupLeads(leads, "", "All", new Date(2026, 9, 14)).today.map(l => l.id), [2]);
});

test("relative times handle minutes, days, and clock skew", () => {
  assert.equal(timeAgo(now.toISOString(), now), "Just now");
  assert.equal(timeAgo(at(14, 0), now), "Just now");
  assert.equal(timeAgo(new Date(now.getTime() - 120_000).toISOString(), now), "2 minutes ago");
  assert.equal(timeAgo(at(11, 14), now), "2 days ago");
});

test("attention filters combine with status and search; counts reflect that scope", () => {
  const leads = [lead(1, { name: "Alex One", follow_up_at: at(13, 9) }),
    lead(2, { name: "Alex Two", follow_up_at: at(13, 16) }),
    lead(3, { name: "Alex Three", follow_up_at: at(12, 9) }),
    lead(4, { name: "Someone Else", status: "Won", follow_up_at: at(13, 9) })];
  const overdue = groupLeads(leads, "alex", "New", now, "Overdue");
  assert.deepEqual(overdue.today.map(l => l.id), [1]);
  assert.deepEqual(overdue.remaining.map(l => l.id), [3]);
  assert.equal(overdue.todayCount, 2);
  assert.equal(overdue.overdueCount, 2);
  const today = groupLeads(leads, "alex", "New", now, "Today");
  assert.deepEqual(today.today.map(l => l.id), [1, 2]);
  assert.deepEqual(today.remaining, []);
});

test("completing a follow-up removes it from both attention counts", () => {
  const completed = lead(1, { follow_up_at: null });
  const groups = groupLeads([completed], "", "All", now, "Overdue");
  assert.equal(groups.todayCount, 0);
  assert.equal(groups.overdueCount, 0);
  assert.deepEqual(groups.today, []);
  assert.deepEqual(groups.remaining, []);
  assert.equal(isOverdue(null, now), false);
  assert.equal(isOverdue(now.toISOString(), now), false);
  assert.equal(isOverdue(at(13, 9), now), true);
});
