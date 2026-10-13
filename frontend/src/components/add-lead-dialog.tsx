"use client";

import { useState } from "react";
import { ArrowUpRight, LoaderCircle, UserRoundPlus } from "lucide-react";
import { api } from "@/lib/api";
import type { Lead } from "@/lib/leads";
import Dialog from "./dialog";

export default function AddLeadDialog({ onClose, onSaved }: { onClose: () => void; onSaved: (lead: Lead) => void }) {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  function close() {
    if (saving) return;
    if ((name || company || phone) && !window.confirm("Discard this unsaved lead?")) return;
    onClose();
  }

  return <Dialog titleId="add-lead-title" onClose={close}>
    <header className="modal-header">
      <div className="modal-symbol"><UserRoundPlus size={22} aria-hidden="true" /></div>
      <h2 id="add-lead-title">Add a lead</h2>
      <p>A name is all you need to get started.</p>
    </header>
    <form onSubmit={async event => {
      event.preventDefault();
      if (saving) return;
      if (!name.trim()) { setError("Enter a name for this lead."); return; }
      setSaving(true); setError("");
      try {
        const lead = await api<Lead>("/leads", { method: "POST", body: JSON.stringify({
          name: name.trim(), company: company.trim() || null, phone: phone.trim() || null,
        }) });
        onSaved(lead);
      } catch (error) { setError((error as Error).message); }
      finally { setSaving(false); }
    }}>
      <fieldset disabled={saving} className="lead-fields">
        <label htmlFor="lead-name">Full name <span className="required-mark">*</span></label>
        <input id="lead-name" autoComplete="name" placeholder="e.g. Alex Morgan" required
          maxLength={120} value={name} onChange={event => setName(event.target.value)} />
        <label htmlFor="lead-company">Company <span className="optional">Optional</span></label>
        <input id="lead-company" autoComplete="organization" placeholder="Company name" maxLength={160}
          value={company} onChange={event => setCompany(event.target.value)} />
        <label htmlFor="lead-phone">Phone <span className="optional">Optional</span></label>
        <input id="lead-phone" type="tel" autoComplete="tel" placeholder="e.g. +91 98765 43210" maxLength={40}
          value={phone} onChange={event => setPhone(event.target.value)} />
        <p className="field-hint">Your lead starts with the status <span className="mini-status">New</span>.</p>
      </fieldset>
      {error && <p className="form-error" role="alert">{error}</p>}
      <footer className="modal-footer">
        <button type="button" className="button button-secondary" disabled={saving} onClick={close}>Cancel</button>
        <button className="button button-primary" disabled={saving}>
          {saving ? <><LoaderCircle size={16} className="spin" aria-hidden="true" /> Saving…</>
            : <>Add lead <ArrowUpRight size={16} aria-hidden="true" /></>}
        </button>
      </footer>
    </form>
  </Dialog>;
}
