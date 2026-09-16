"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Search, Trash2, Upload } from "lucide-react";
import { updateTrainingPackResourcesAction } from "@/app/portal/actions";
import { BookingDialogShell } from "@/components/site/booking-dialog-shell";
import { Button } from "@/components/ui/button";
import type { ResourceRecord, TrainingPackRecord } from "@/lib/services/portal";

export function RemoveFromTrainingPackButton({ packId, resource, showDraft = false }: { packId: string; resource: ResourceRecord; showDraft?: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  function update(intent: "remove" | "draft") {
    startTransition(async () => {
      const data = new FormData();
      data.set("packId", packId); data.set("intent", intent); data.append("resourceId", resource.id);
      try {
        const result = await updateTrainingPackResourcesAction(data);
        setError(result.error || "");
      } catch { setError("Could not update this resource. Please try again."); }
    });
  }
  return <div>
    <div className="flex items-center gap-2">
      {showDraft && resource.isActive ? <Button type="button" variant="secondary" disabled={pending} onClick={() => {
        if (window.confirm(`Make “${resource.title}” a draft? It will be hidden from ambassadors in every pack until published again.`)) update("draft");
      }}>Make draft</Button> : showDraft ? <span className="text-xs">Draft</span> : null}
      <Button type="button" variant="danger" loading={pending} pendingLabel="Updating…"
        title="Remove from this pack" aria-label={`Remove ${resource.title} from this pack`}
        onClick={() => update("remove")}><Trash2 className="h-4 w-4" /></Button>
    </div>
    {error ? <p role="alert" className="text-xs text-red-700">{error}</p> : null}
  </div>;
}

export function TrainingPackResourcePicker({ pack, resources, onClose, onUpload, onAdded }: {
  pack: TrainingPackRecord; resources: ResourceRecord[]; onClose: () => void; onUpload: () => void; onAdded: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const linked = resources.filter((resource) => resource.trainingPackIds?.includes(pack.id));
  const available = resources.filter((resource) => !resource.trainingPackIds?.includes(pack.id) && resource.audiences.includes("ambassador") &&
    `${resource.title} ${resource.type} ${resource.presentationTitle || ""} ${resource.tags.join(" ")}`.toLowerCase().includes(query.toLowerCase()));
  function addSelected() {
    startTransition(async () => {
      setError(""); setMessage("");
      const data = new FormData(); data.set("packId", pack.id); data.set("intent", "add");
      selected.forEach((id) => data.append("resourceId", id));
      try {
        const result = await updateTrainingPackResourcesAction(data);
        if (result.error) setError(result.error);
        else { setMessage(`${selected.size} resource(s) added to ${pack.title}.`); setSelected(new Set()); onAdded(); }
      } catch { setError("Resources could not be added. Your selection is still here; please try again."); }
    });
  }
  return createPortal(<BookingDialogShell title={`Add to ${pack.title}`} compact onClose={() => { if (!pending) onClose(); }} maxWidthClassName="max-w-[800px]" overlayClassName="z-[80]">
    <div className="mt-6 grid gap-4">
      <details open className="rounded-[16px] border p-4">
        <summary className="cursor-pointer font-semibold">Choose existing resources ({selected.size} selected)</summary>
        <label className="mt-3 flex items-center gap-2 rounded-xl border px-3 py-2">
          <Search className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">Search existing resources</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, presentation or tags…" className="min-w-0 flex-1 bg-transparent outline-none" />
        </label>
        <div className="mt-3 grid max-h-72 gap-1 overflow-y-auto">
          {available.map((resource) => <label key={resource.id} className="flex cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-green-50">
            <input type="checkbox" disabled={pending} checked={selected.has(resource.id)} onChange={(event) => setSelected((previous) => {
              const next = new Set(previous); if (event.target.checked) next.add(resource.id); else next.delete(resource.id); return next;
            })} />
            <span><span className="block font-medium">{resource.title}</span><span className="text-xs text-[color:var(--text-soft)]">{resource.type} · {resource.isActive ? resource.isCurrent ? "Published" : "Archived" : "Draft"}</span></span>
          </label>)}
          {!available.length ? <p className="p-2 text-sm">No matching resources. Already linked items appear below.</p> : null}
        </div>
      </details>
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      {message ? <p role="status" className="text-sm text-green-700">{message}</p> : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button disabled={pending} variant="secondary" onClick={onUpload}><Upload className="h-4 w-4" />Upload new resource</Button>
        <Button disabled={!selected.size || selected.size > 100} loading={pending} pendingLabel="Adding…" onClick={addSelected}>Add {selected.size || "selected"} resources</Button>
      </div>
      {linked.length ? <section className="grid gap-2 border-t pt-4"><h3 className="font-semibold">In this pack</h3>
        {linked.map((resource) => <div key={resource.id} className="flex items-center justify-between gap-3 rounded-lg border p-3"><span>{resource.title}</span><RemoveFromTrainingPackButton packId={pack.id} resource={resource} showDraft /></div>)}
      </section> : null}
    </div>
  </BookingDialogShell>, document.body);
}
