"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Rule = {
  id: string;
  name: string;
  triggerType: string;
  enabled: boolean;
  priority: number;
};

type Execution = {
  id: string;
  ruleId: string;
  triggerType: string;
  status: string;
  startedAt: string;
};

export function AutomationsPanel(props: {
  organizationId: string;
  role: string;
  rules: Rule[];
  executions: Execution[];
}) {
  const canManage = props.role === "OWNER" || props.role === "ADMIN";
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function createRule() {
    if (!name.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: props.organizationId,
          name: name.trim(),
          triggerType: "conversation.created",
          conditions: [
            {
              field: "conversation.status",
              operator: "equals",
              value: "OPEN",
            },
          ],
          actions: [
            { type: "set_priority", priority: "HIGH" },
          ],
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Failed");
        return;
      }
      setName("");
      router.refresh();
    });
  }

  function toggle(ruleId: string, enabled: boolean) {
    startTransition(async () => {
      const res = await fetch(`/api/automations/${ruleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error?.message ?? "Failed");
        return;
      }
      router.refresh();
    });
  }

  function remove(ruleId: string) {
    if (!confirm("Delete this automation rule?")) return;
    startTransition(async () => {
      const res = await fetch(`/api/automations/${ruleId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error?.message ?? "Failed");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-8 text-sm">
      <section className="border border-[#e4e4e2] bg-white p-5">
        <h2 className="font-medium">Rules</h2>
        {props.rules.length === 0 ? (
          <p className="mt-2 text-[#5c5c5c]">No automation rules yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {props.rules.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 border border-[#e4e4e2] px-3 py-2"
              >
                <div>
                  <span className="font-medium">{r.name}</span>
                  <span className="ml-2 text-xs text-[#5c5c5c]">
                    {r.triggerType} · priority {r.priority} ·{" "}
                    {r.enabled ? "enabled" : "disabled"}
                  </span>
                </div>
                {canManage ? (
                  <div className="flex gap-2 text-xs">
                    <button
                      type="button"
                      disabled={pending}
                      className="text-[#1f4e3d] hover:underline"
                      onClick={() => toggle(r.id, !r.enabled)}
                    >
                      {r.enabled ? "Disable" : "Enable"}
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      className="text-red-700 hover:underline"
                      onClick={() => remove(r.id)}
                    >
                      Delete
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {canManage ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Rule name"
              className="border border-[#e4e4e2] px-3 py-2"
            />
            <button
              type="button"
              disabled={pending}
              onClick={createRule}
              className="border border-[#141414] bg-[#141414] px-4 text-white disabled:opacity-50"
            >
              Create (conversation.created → HIGH priority)
            </button>
          </div>
        ) : null}
      </section>

      <section className="border border-[#e4e4e2] bg-white p-5">
        <h2 className="font-medium">Recent executions</h2>
        {props.executions.length === 0 ? (
          <p className="mt-2 text-[#5c5c5c]">No executions yet.</p>
        ) : (
          <ul className="mt-3 space-y-1 text-xs text-[#5c5c5c]">
            {props.executions.map((e) => (
              <li key={e.id}>
                {e.status} · {e.triggerType} · {e.startedAt}
              </li>
            ))}
          </ul>
        )}
      </section>

      {error ? (
        <p className="text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
