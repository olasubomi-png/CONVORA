import type { VerificationStatus } from "@/db/schema";

export function VerificationBadge({ status }: { status: VerificationStatus }) {
  if (status === "VERIFIED") {
    return (
      <span className="inline-flex items-center border border-[#1f4e3d] px-2 py-0.5 text-xs font-medium text-[#1f4e3d]">
        Verified
      </span>
    );
  }
  if (status === "PENDING") {
    return (
      <span className="inline-flex items-center border border-[#a67c00] px-2 py-0.5 text-xs text-[#a67c00]">
        Pending verification
      </span>
    );
  }
  if (status === "SUSPENDED") {
    return (
      <span className="inline-flex items-center border border-[#8a1f1f] px-2 py-0.5 text-xs text-[#8a1f1f]">
        Verification suspended
      </span>
    );
  }
  return (
    <span className="inline-flex items-center border border-[#e4e4e2] px-2 py-0.5 text-xs text-[#5c5c5c]">
      Unverified
    </span>
  );
}
