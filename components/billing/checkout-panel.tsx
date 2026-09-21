"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type CatalogPlan = {
  code: string;
  monthlyDisplay: string;
  yearlyDisplay: string;
  monthlyAmountMinor: number;
  yearlyAmountMinor: number;
};

export function CheckoutPanel({
  organizationId,
  starter,
  premium,
}: {
  organizationId: string;
  starter: CatalogPlan | null;
  premium: CatalogPlan | null;
}) {
  const [planCode, setPlanCode] = useState<"STARTER" | "PREMIUM">("STARTER");
  const [interval, setInterval] = useState<"MONTHLY" | "YEARLY">("MONTHLY");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const plan = planCode === "STARTER" ? starter : premium;
  const price =
    interval === "YEARLY" ? plan?.yearlyDisplay : plan?.monthlyDisplay;

  function startCheckout() {
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, planCode, interval }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Unable to start checkout");
        return;
      }
      if (data.authorizationUrl) {
        window.location.href = data.authorizationUrl as string;
        return;
      }
      setError("Checkout URL missing");
      router.refresh();
    });
  }

  return (
    <section className="border border-[#e4e4e2] bg-white p-5 space-y-4">
      <h2 className="text-sm font-medium">Upgrade / pay</h2>
      <p className="text-xs text-[#5c5c5c]">
        Amount is calculated on the server. Payment is confirmed only after
        Paystack verification.
      </p>
      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-[#5c5c5c]">Plan</span>
          <select
            className="border border-[#e4e4e2] px-2 py-1.5"
            value={planCode}
            onChange={(e) =>
              setPlanCode(e.target.value as "STARTER" | "PREMIUM")
            }
          >
            <option value="STARTER">Starter</option>
            <option value="PREMIUM">Premium</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[#5c5c5c]">Interval</span>
          <select
            className="border border-[#e4e4e2] px-2 py-1.5"
            value={interval}
            onChange={(e) =>
              setInterval(e.target.value as "MONTHLY" | "YEARLY")
            }
          >
            <option value="MONTHLY">Monthly</option>
            <option value="YEARLY">Yearly (20% off)</option>
          </select>
        </label>
      </div>
      <p className="text-lg tracking-tight">
        {price ?? "—"}
        <span className="text-xs text-[#5c5c5c]">
          {" "}
          / {interval === "YEARLY" ? "year" : "month"}
        </span>
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={startCheckout}
        className="bg-[#1a1a1a] px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {pending ? "Starting checkout…" : "Pay with Paystack"}
      </button>
    </section>
  );
}
