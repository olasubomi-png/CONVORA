import Image from "next/image";
import Link from "next/link";

type BrandLogoProps = {
  href?: string;
  /** Show the CONVORA wordmark next to the mark. */
  showWordmark?: boolean;
  /** Pixel size of the square mark. */
  size?: number;
  /** Wordmark color class when shown. */
  wordmarkClassName?: string;
  className?: string;
  priority?: boolean;
};

/**
 * Official CONVORA brand mark (logo image + optional wordmark).
 */
export function BrandLogo({
  href = "/",
  showWordmark = true,
  size = 32,
  wordmarkClassName = "text-[var(--cv-fg)]",
  className = "",
  priority = false,
}: BrandLogoProps) {
  const mark = (
    <Image
      src="/logo.png"
      alt="CONVORA"
      width={size}
      height={size}
      className="rounded-lg"
      priority={priority}
    />
  );

  const content = (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      {mark}
      {showWordmark ? (
        <span
          className={`text-sm font-semibold tracking-[0.14em] ${wordmarkClassName}`}
        >
          CONVORA
        </span>
      ) : null}
    </span>
  );

  if (!href) {
    return content;
  }

  return (
    <Link href={href} className="inline-flex items-center">
      {content}
    </Link>
  );
}
