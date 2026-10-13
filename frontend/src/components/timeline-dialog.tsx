"use client";

import { useEffect, useState } from "react";
import { CalendarClock, Check, LoaderCircle, MessageSquare, Phone, Send } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate, formatTime, isOverdue, isToday, statuses, timeAgo, type Discussion, type Lead, type Status } from "@/lib/leads";
import Dialog from "./dialog";

export default function TimelineDialog({ lead, now, onClose, onUpdated }: {
  lead: Lead; now: Date; onClose: () => void; onUpdated: (lead: Lead) => void;
}) {
  const [history, setHistory] = useState<Discussion[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [note, setNote] = useState("");
  const [schedule, setSchedule] = useState(false);
  const [followUp, setFollowUp] = useState("");
  const [pending, setPending] = useState<"note" | "status" | "follow-up" | null>(null);
  const [actionError, setActionError] = useState("");
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const busy = pending !== null;

  useEffect(() => {
    const controller = new AbortController();
    setLoadError("");
    api<Discussion[]>(`/leads/${lead.id}/discussions`, { signal: controller.signal })
      .then(setHistory).catch(error => { if (!controller.signal.aborted) setLoadError(error.message); });
    return () => controller.abort();
  }, [lead.id, attempt]);

  function close() {
    if (busy) return;
    if ((note || followUp) && !window.confirm("Discard this unsaved discussion?")) return;
    onClose();
  }

  async function changeStatus(status: Status) {
    setPending("status"); setActionError(""); setFeedback("");
    try {
      onUpdated(await api<Lead>(`/leads/${lead.id}`, { method: "PATCH", body: JSON.stringify({ status }) }));
      setFeedback("Status updated.");
    } catch (error) { setActionError((error as Error).message); }
    finally { setPending(null); }
  }

  return <Dialog titleId="timeline-title" wide onClose={close} busy={busy}>
    <header className="timeline-header">
      <span className="eyebrow">LEAD DETAILS</span>
      <h2 id="timeline-title">{lead.name}</h2>
      <div className="lead-contact">
        {lead.company && <span>{lead.company}</span>}
        {lead.company && lead.phone && <span aria-hidden="true">·</span>}
        {lead.phone && <span><Phone size={13} aria-hidden="true" />{lead.phone}</span>}
        {!lead.company && !lead.phone && <span>No contact details added</span>}
      </div>
      <div className="status-control">
        <label htmlFor="lead-status">Status</label>
        <select id="lead-status" value={lead.status} disabled={busy}
          onChange={event => changeStatus(event.target.value as Status)}>
          {statuses.map(status => <option key={status}>{status}</option>)}
        </select>
        {pending === "status" && <LoaderCircle size={15} className="spin" aria-label="Updating status" />}
      </div>
      {lead.follow_up_at && <div className={`current-appointment ${isOverdue(lead.follow_up_at, now) ? "appointment-overdue" : ""}`}>
        <CalendarClock size={17} aria-hidden="true" />
        <div><span>{isOverdue(lead.follow_up_at, now) ? "Overdue follow-up" : "Next follow-up"}</span>
          <strong>{isToday(lead.follow_up_at, now) ? "Today" : formatDate(lead.follow_up_at)} at {formatTime(lead.follow_up_at)}</strong></div>
        <button type="button" className="button button-secondary" disabled={busy} onClick={async () => {
          setPending("follow-up"); setActionError(""); setFeedback("");
          try {
            onUpdated(await api<Lead>(`/leads/${lead.id}/follow-up`, { method: "DELETE" }));
            setFeedback("Follow-up completed.");
          } catch (error) { setActionError((error as Error).message); }
          finally { setPending(null); }
        }}>
          {pending === "follow-up" ? <LoaderCircle size={14} className="spin" aria-hidden="true" /> : <Check size={14} aria-hidden="true" />}
          {pending === "follow-up" ? "Completing…" : "Mark complete"}
        </button>
      </div>}
      {actionError && <p className="form-error action-error" role="alert">{actionError}</p>}
    </header>
    <section className="history" aria-label="Discussion history" aria-busy={!history && !loadError}>
      <div className="history-heading"><h3>Discussion history</h3><span>{history ? `${history.length} ${history.length === 1 ? "note" : "notes"}` : ""}</span></div>
      {loadError ? <div className="inline-empty"><p role="alert">{loadError}</p>
        <button className="button button-secondary" onClick={() => setAttempt(value => value + 1)}>Try again</button></div>
        : history === null ? <p className="inline-empty" role="status">Loading discussions…</p>
        : !history.length ? <div className="inline-empty"><MessageSquare size={25} aria-hidden="true" />
          <h3>No discussions yet</h3><p>Log your first conversation below.</p></div>
        : <ol className="timeline">
          {history.map((discussion, index) => <li key={discussion.id} className={index === 0 ? "latest" : ""}>
            <div className="timeline-dot" aria-hidden="true" />
            <div className="note-timestamp"><time dateTime={discussion.created_at}>
              {formatDate(discussion.created_at)} <span>at {formatTime(discussion.created_at)}</span>
            </time>{index === 0 && <span className="latest-label">Latest</span>}</div>
            <p className="discussion-note">{discussion.note}</p>
            {discussion.follow_up_at && <div className="scheduled-note"><CalendarClock size={13} aria-hidden="true" />
              Follow-up set for {formatDate(discussion.follow_up_at)}, {formatTime(discussion.follow_up_at)}</div>}
            <span className="note-relative">{timeAgo(discussion.created_at, now)}</span>
          </li>)}
        </ol>}
    </section>
    <form className="composer" onSubmit={async event => {
      event.preventDefault();
      if (busy || !history) return;
      if (!note.trim()) { setError("Write a discussion note before saving."); return; }
      setPending("note"); setError(""); setFeedback("");
      try {
        const saved = await api<{ lead: Lead; discussion: Discussion }>(`/leads/${lead.id}/discussions`, {
          method: "POST", body: JSON.stringify({ note: note.trim(),
            follow_up_at: schedule ? new Date(followUp).toISOString() : null }),
        });
        setHistory(current => [saved.discussion, ...(current || [])]);
        onUpdated(saved.lead);
        setNote(""); setSchedule(false); setFollowUp(""); setFeedback("Discussion saved.");
      } catch (error) { setError((error as Error).message); }
      finally { setPending(null); }
    }}>
      <label htmlFor="discussion-note" className="composer-label">Log a discussion</label>
      <textarea id="discussion-note" placeholder="What did you talk about?" rows={3} required maxLength={5000}
        value={note} disabled={busy || !history} onChange={event => setNote(event.target.value)} />
      <div className="composer-options">
        <label className="checkbox-label"><input type="checkbox" checked={schedule} disabled={busy || !history}
          onChange={event => setSchedule(event.target.checked)} /><CalendarClock size={16} aria-hidden="true" />
          Schedule a follow-up</label>
        <span className="note-limit">{note.length.toLocaleString()} / 5,000</span>
      </div>
      {schedule && <div className="follow-up-fields"><label htmlFor="follow-up-date">Date & time <span className="optional">Your local time</span></label>
        <input id="follow-up-date" type="datetime-local" required value={followUp} disabled={busy}
          onChange={event => setFollowUp(event.target.value)} /></div>}
      {!schedule && lead.follow_up_at && <p className="field-hint current-follow-up">Your current follow-up stays in place unless you reschedule it.</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <footer className="composer-footer">
        <span className="save-feedback" role="status">{feedback && <><Check size={14} aria-hidden="true" />{feedback}</>}</span>
        <button className="button button-primary" disabled={busy || !history}>
          {pending === "note" ? <><LoaderCircle size={15} className="spin" aria-hidden="true" /> Saving…</>
            : <><Send size={15} aria-hidden="true" /> Save discussion</>}
        </button>
      </footer>
    </form>
  </Dialog>;
}
