"use client";

import { useState, useTransition } from "react";

type Props = {
  conversationId: string;
};

type PanelState = {
  summary?: string;
  draft?: string;
  intent?: string;
  sentiment?: string;
  priority?: string;
  error?: string;
};

export function AiCopilotPanel({ conversationId }: Props) {
  const [state, setState] = useState<PanelState>({});
  const [pending, startTransition] = useTransition();

  async function run(path: string, key: keyof PanelState) {
    setState((s) => ({ ...s, error: undefined }));
    const res = await fetch(`/api/ai/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setState((s) => ({
        ...s,
        error: data.error?.message ?? "AI request failed",
      }));
      return;
    }
    const result = data.result ?? {};
    if (key === "summary") {
      setState((s) => ({ ...s, summary: result.summary as string }));
    } else if (key === "draft") {
      setState((s) => ({ ...s, draft: result.draft as string }));
    } else if (key === "intent") {
      setState((s) => ({ ...s, intent: result.intent as string }));
    } else if (key === "sentiment") {
      setState((s) => ({ ...s, sentiment: result.sentiment as string }));
    } else if (key === "priority") {
      setState((s) => ({ ...s, priority: result.priority as string }));
    }
  }

  return (
    <aside className="border border-[#e4e4e2] bg-white p-4 text-sm">
      <h3 className="text-base tracking-tight">AI Copilot</h3>
      <p className="mt-1 text-xs text-[#5c5c5c]">
        Suggestions only — you stay in control. Nothing is sent to the customer
        automatically.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {(
          [
            ["conversation-summary", "summary", "Summary"],
            ["suggested-reply", "draft", "Suggest reply"],
            ["intent", "intent", "Intent"],
            ["sentiment", "sentiment", "Sentiment"],
            ["priority", "priority", "Priority"],
          ] as const
        ).map(([path, key, label]) => (
          <button
            key={path}
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(() => {
                void run(path, key);
              })
            }
            className="border border-[#e4e4e2] px-2 py-1 text-xs hover:border-[#141414] disabled:opacity-50"
          >
            {label}
          </button>
        ))}
      </div>

      {state.error ? (
        <p className="mt-3 text-xs text-red-700" role="alert">
          {state.error}
        </p>
      ) : null}

      {state.summary ? (
        <div className="mt-4 border-t border-[#e4e4e2] pt-3">
          <p className="text-xs font-medium text-[#5c5c5c]">Summary (AI)</p>
          <p className="mt-1 whitespace-pre-wrap">{state.summary}</p>
        </div>
      ) : null}

      {state.draft ? (
        <div className="mt-4 border-t border-[#e4e4e2] pt-3">
          <p className="text-xs font-medium text-[#5c5c5c]">
            Suggested reply (draft — not sent)
          </p>
          <textarea
            className="mt-1 w-full border border-[#e4e4e2] px-2 py-1 text-sm"
            rows={4}
            defaultValue={state.draft}
          />
          <p className="mt-1 text-xs text-[#5c5c5c]">
            Edit freely, then paste into the composer and send yourself.
          </p>
        </div>
      ) : null}

      <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
        {state.intent ? (
          <div>
            <dt className="text-[#5c5c5c]">Intent</dt>
            <dd>{state.intent}</dd>
          </div>
        ) : null}
        {state.sentiment ? (
          <div>
            <dt className="text-[#5c5c5c]">Sentiment</dt>
            <dd>{state.sentiment}</dd>
          </div>
        ) : null}
        {state.priority ? (
          <div>
            <dt className="text-[#5c5c5c]">Priority signal</dt>
            <dd>{state.priority}</dd>
          </div>
        ) : null}
      </dl>
    </aside>
  );
}
