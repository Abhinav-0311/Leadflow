"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

export default function Dialog({ titleId, children, onClose, wide = false, busy = false }: {
  titleId: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const opener = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    dialog.querySelector<HTMLElement>("input, select, textarea")?.focus();
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      (opener?.isConnected ? opener : document.querySelector<HTMLElement>("main"))?.focus();
    };
  }, []);

  return <dialog ref={ref} aria-labelledby={titleId} className={wide ? "modal modal-wide" : "modal"}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="modal-panel">
      <button type="button" className="icon-button modal-close" aria-label="Close dialog" disabled={busy} onClick={onClose}>
        <X size={19} aria-hidden="true" />
      </button>
      {children}
    </div>
  </dialog>;
}
