"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Props = {
  organizationId: string;
  membershipId: string;
  role: string;
  teams: { id: string; name: string; description: string | null }[];
  unassignedCount: number;
  presence: {
    membershipId: string;
    status: string;
    lastSeenAt: string;
  }[];
  byAgent: { membershipId: string | null; activeCount: number }[];
};

export function TeamOpsPanel(props: Props) {
  const [status, setStatus] = useState("ONLINE");
  const [teamName, setTeamName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const canManage = props.role === "OWNER" || props.role === "ADMIN";

  function setPresence(next: string) {
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: props.organizationId,
          status: next,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Failed");
        return;
      }
      setStatus(next);
      router.refresh();
    });
  }

  function createTeam() {
    if (!teamName.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: props.organizationId,
          name: teamName.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Failed");
        return;
      }
      setTeamName("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-8 text-sm">
      <section className="border border-[#e4e4e2] bg-white p-5">
        <h2 className="font-medium">Your presence</h2>
        <div className="mt-3 flex gap-2">
          {(["ONLINE", "AWAY", "OFFLINE"] as const).map((s) => (
            <button
              key={s}
              type="button"
              disabled={pending}
              onClick={() => setPresence(s)}
              className={`border px-3 py-1 ${
                status === s
                  ? "border-[#1f4e3d] bg-[#1f4e3d] text-white"
                  : "border-[#e4e4e2]"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </section>

      <section className="border border-[#e4e4e2] bg-white p-5">
        <h2 className="font-medium">Workload</h2>
        <p className="mt-2 text-[#5c5c5c]">
          Unassigned open conversations:{" "}
          <strong className="text-[#141414]">{props.unassignedCount}</strong>
        </p>
        <Link
          href="/app/inbox"
          className="mt-2 inline-block text-[#1f4e3d] hover:underline"
        >
          Open inbox →
        </Link>
        <ul className="mt-4 space-y-1 text-xs text-[#5c5c5c]">
          {props.byAgent
            .filter((a) => a.membershipId)
            .map((a) => (
              <li key={a.membershipId}>
                Agent {a.membershipId?.slice(0, 8)}… — {a.activeCount} active
              </li>
            ))}
        </ul>
      </section>

      <section className="border border-[#e4e4e2] bg-white p-5">
        <h2 className="font-medium">Teams</h2>
        {props.teams.length === 0 ? (
          <p className="mt-2 text-[#5c5c5c]">No teams yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {props.teams.map((t) => (
              <li key={t.id} className="border border-[#e4e4e2] px-3 py-2">
                <span className="font-medium">{t.name}</span>
                {t.description ? (
                  <span className="ml-2 text-[#5c5c5c]">{t.description}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {canManage ? (
          <div className="mt-4 flex gap-2">
            <input
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="New team name"
              className="border border-[#e4e4e2] px-3 py-2"
            />
            <button
              type="button"
              disabled={pending}
              onClick={createTeam}
              className="border border-[#141414] bg-[#141414] px-4 text-white disabled:opacity-50"
            >
              Create
            </button>
          </div>
        ) : null}
      </section>

      {error ? (
        <p className="text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
