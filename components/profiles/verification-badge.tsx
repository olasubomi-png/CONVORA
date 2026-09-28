import type { VerificationStatus } from "@/db/schema";
import { cn } from "@/lib/utils";

/**
 * Compact blue circular verification mark for public surfaces.
 * Only use when status is VERIFIED.
 */
export function VerifiedCheck({
  className,
  size = 16,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <span
      role="img"
      aria-label="Verified account"
      title="Verified account"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-[#1877F2] text-white",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 16 16"
        width={Math.round(size * 0.62)}
        height={Math.round(size * 0.62)}
        aria-hidden
        focusable="false"
      >
        <path
          fill="currentColor"
          d="M6.4 11.2 3.2 8l1.13-1.13L6.4 8.93l5.27-5.26L12.8 4.8 6.4 11.2z"
        />
      </svg>
    </span>
  );
}

/**
 * Public verification badge.
 * Only VERIFIED renders; pending/suspended/unverified render nothing.
 */
export function VerificationBadge({
  status,
  className,
  size = 16,
}: {
  status: VerificationStatus;
  className?: string;
  size?: number;
}) {
  if (status !== "VERIFIED") return null;
  return <VerifiedCheck className={className} size={size} />;
}
