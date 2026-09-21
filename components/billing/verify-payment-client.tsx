"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function VerifyPaymentClient({ reference }: { reference: string }) {
  const [message, setMessage] = useState("Verifying…");
  const [ok, setOk] = useState<boolean | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!reference) {
      setMessage("Missing payment reference.");
      setOk(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/billing/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reference }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setOk(false);
          setMessage(data.error?.message ?? "Verification failed");
          return;
        }
        if (data.paid === false) {
          setOk(false);
          setMessage("Payment was not successful.");
          return;
        }
        setOk(true);
        setMessage(
          data.alreadyProcessed
            ? "Payment already confirmed. Your plan is active."
            : "Payment confirmed. Your plan is now active.",
        );
        router.refresh();
      } catch {
        if (!cancelled) {
          setOk(false);
          setMessage("Unable to verify payment.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reference, router]);

  return (
    <p
      className={`text-sm ${ok === false ? "text-red-700" : ok ? "text-[#1f4e3d]" : "text-[#5c5c5c]"}`}
      role="status"
    >
      {message}
    </p>
  );
}
