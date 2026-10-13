"use client";

import { useEffect, useState } from "react";
import { CalendarClock, ChevronRight, CircleAlert, ListFilter, Plus, Search, Users, X } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate, formatTime, groupLeads, isToday, statuses, timeAgo, type Lead, type Status } from "@/lib/leads";
import AddLeadDialog from "./add-lead-dialog";
import TimelineDialog from "./timeline-dialog";

function LeadRow({ lead, now, onClick }: { lead: Lead; now: Date; onClick: () => void }) {
  const overdue = lead.follow_up_at && Date.parse(lead.follow_up_at) < now.getTime();
  const today = lead.follow_up_at && isToday(lead.follow_up_at, now);
  return <button className="lead-row" onClick={onClick} aria-label={`Open ${lead.name}`}>
    <span className="lead-identity">
      <span className="avatar" aria-hidden="true">{lead.name.split(/\s+/).slice(0, 2).map(part => part[0]).join("")}</span>
      <span className="lead-name-block"><span className="lead-name">{lead.name}</span>
        <span className="lead-company">{lead.company || "No company added"}</span></span>
    </span>
    <span className="lead-context">
      <span className={`last-note ${lead.last_note ? "" : "no-note"}`}>{lead.last_note || "No discussions yet"}</span>
      <span className="lead-meta">
        {lead.last_discussion_at && <time dateTime={lead.last_discussion_at} title={new Date(lead.last_discussion_at).toLocaleString()}>
          {timeAgo(lead.last_discussion_at, now)}</time>}
        {lead.follow_up_at && <span className={`follow-up ${overdue ? "overdue" : today ? "due-today" : ""}`}>
          {overdue ? <CircleAlert size={12} aria-hidden="true" /> : <CalendarClock size={12} aria-hidden="true" />}
          {overdue && "Overdue · "}{today ? "Today" : formatDate(lead.follow_up_at)}, {formatTime(lead.follow_up_at)}
        </span>}
      </span>
    </span>
    <span className={`status-badge status-${lead.status.toLowerCase().replaceAll(" ", "-")}`}>
      <span className="status-dot" aria-hidden="true" />{lead.status}</span>
    <ChevronRight className="row-chevron" size={16} aria-hidden="true" />
  </button>;
}

export default function LeadWorkspace() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Status | "All">("All");
  const [adding, setAdding] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    api<Lead[]>("/leads", { signal: controller.signal }).then(setLeads)
      .catch(error => { if (!controller.signal.aborted) setError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 30_000);
    const refresh = () => setNow(new Date());
    window.addEventListener("focus", refresh);
    return () => { clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, []);

  const selected = leads.find(lead => lead.id === selectedId);
  const groups = groupLeads(leads, query, status, now || new Date(0));
  const visible = groups.today.length + groups.remaining.length;
  const filtered = query.trim() !== "" || status !== "All";

  return <>
    <a href="#leads" className="skip-link">Skip to leads</a>
    <header className="app-header"><div className="header-inner">
      <a href="/" className="brand" aria-label="LeadFlow home"><img className="brand-mark" src="/icon.svg" width={36} height={36} alt="" />LeadFlow</a>
      <span className="header-date">{now?.toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric" })}</span>
    </div></header>
    <main id="leads" className="workspace" tabIndex={-1}>
      <div className="page-heading">
        <div><div className="title-line"><h1>Your leads</h1>{!loading && !error && <span className="lead-count">{leads.length}</span>}</div>
          <p>Keep track of conversations and upcoming follow-ups.</p></div>
        <button className="button button-primary" onClick={() => setAdding(true)}><Plus size={17} aria-hidden="true" />Add lead</button>
      </div>
      <div className="toolbar">
        <div className="search-box"><Search size={17} aria-hidden="true" /><label className="sr-only" htmlFor="lead-search">Search leads by name</label>
          <input id="lead-search" type="search" placeholder="Search by name…" value={query} onChange={event => setQuery(event.target.value)} />
          {query && <button className="search-clear" aria-label="Clear search" onClick={() => setQuery("")}><X size={14} aria-hidden="true" /></button>}
        </div>
        <span className="toolbar-count">{loading ? "Loading leads…" : error ? "" : `${visible} ${visible === 1 ? "lead" : "leads"}${filtered ? " found" : " in your workspace"}`}</span>
      </div>
      <div className="filter-bar" role="group" aria-label="Filter leads by status">
        <ListFilter size={16} className="filter-icon" aria-hidden="true" />
        {(["All", ...statuses] as const).map(value => <button key={value} aria-pressed={status === value}
          className={`filter-button ${status === value ? "active" : ""}`} onClick={() => setStatus(value)}>
          {value === "All" ? "All leads" : value}</button>)}
      </div>
      {loading || !now ? <div className="loading-list" aria-label="Loading leads" role="status">
        {[0, 1, 2, 3].map(index => <div className="skeleton-row" key={index}><span /><div /><span /></div>)}
      </div> : error ? <div className="empty-state"><CircleAlert size={30} aria-hidden="true" />
        <h2>Couldn’t load your leads</h2><p role="alert">{error}</p>
        <button className="button button-secondary" onClick={() => setAttempt(value => value + 1)}>Try again</button></div>
        : !visible ? <div className="empty-state"><Users size={30} aria-hidden="true" />
          <h2>{filtered ? "No matching leads" : "Start with a conversation"}</h2>
          <p>{filtered ? "Try another name or clear your filters." : "Add your first lead. The next steps will live here."}</p>
          {filtered ? <button className="button button-secondary" onClick={() => { setQuery(""); setStatus("All"); }}>Clear filters</button>
            : <button className="button button-primary" onClick={() => setAdding(true)}><Plus size={16} aria-hidden="true" />Add your first lead</button>}</div>
        : <>
          {groups.today.length > 0 && <section className="lead-section today-section" aria-labelledby="today-title">
            <div className="section-heading"><h2 id="today-title"><CalendarClock size={16} aria-hidden="true" />Today’s follow-ups <span>{groups.today.length}</span></h2>
              <p>Pinned for today</p></div>
            <div className="lead-list">{groups.today.map(lead => <LeadRow key={lead.id} lead={lead} now={now} onClick={() => setSelectedId(lead.id)} />)}</div>
          </section>}
          {groups.remaining.length > 0 && <section className="lead-section" aria-labelledby="all-title">
            <div className="section-heading"><h2 id="all-title">{groups.today.length ? "Other leads" : "All leads"} <span>{groups.remaining.length}</span></h2>
              <p>Latest activity first</p></div>
            <div className="list-columns" aria-hidden="true"><span>LEAD</span><span>LAST DISCUSSION</span><span>STATUS</span><span /></div>
            <div className="lead-list">{groups.remaining.map(lead => <LeadRow key={lead.id} lead={lead} now={now} onClick={() => setSelectedId(lead.id)} />)}</div>
          </section>}
          <p className="workspace-footnote">Select a lead to view the full conversation.</p>
        </>}
      <div className="sr-only" role="status">{announcement}</div>
    </main>
    {adding && <AddLeadDialog onClose={() => setAdding(false)} onSaved={lead => {
      setLeads(current => [lead, ...current]); setAdding(false); setQuery(""); setStatus("All");
      setAnnouncement(`${lead.name} added.`);
    }} />}
    {selected && now && <TimelineDialog key={selected.id} lead={selected} now={now} onClose={() => setSelectedId(null)}
      onUpdated={updated => { setLeads(current => current.map(lead => lead.id === updated.id ? updated : lead)); setNow(new Date()); }} />}
  </>;
}
