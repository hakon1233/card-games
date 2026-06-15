import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";

type BrandLogoProps = {
  href?: string;
  variant?: "light" | "dark";
  className?: string;
  imageClassName?: string;
};

export function BrandLogo({
  href = "/",
  variant = "light",
  className,
  imageClassName,
}: BrandLogoProps) {
  const src =
    variant === "dark"
      ? "/brand/pip-logo-horizontal-ondark.svg"
      : "/brand/pip-logo-horizontal.svg";

  return (
    <Link
      href={href}
      className={cn(
        "inline-flex min-w-0 items-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className,
      )}
      aria-label="Pip Playing & Card Co. home"
    >
      <Image
        src={src}
        alt="Pip Playing & Card Co."
        width={720}
        height={240}
        priority
        className={cn("h-12 w-auto max-w-[220px] object-contain", imageClassName)}
      />
    </Link>
  );
}

type BrandHeaderProps = {
  title?: string;
  backHref?: string;
  backLabel?: string;
  tone?: "light" | "red" | "dark";
};

export function BrandHeader({
  title,
  backHref = "/",
  backLabel = "Back",
  tone = "light",
}: BrandHeaderProps) {
  const isDark = tone !== "light";

  return (
    <header
      className={cn(
        "flex items-center justify-between gap-4 px-4 py-3 md:px-8",
        tone === "red"
          ? "border-b border-[color-mix(in_oklab,var(--pip-gold)_45%,transparent)] bg-[var(--pip-tin-red)]"
          : tone === "dark"
            ? "border-b border-white/10 bg-[var(--pip-ink)]"
            : "border-b border-border bg-background/95",
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <BrandLogo
          variant={isDark ? "dark" : "light"}
          imageClassName="h-10 max-w-[172px] sm:h-11 sm:max-w-[210px]"
        />
        {title && (
          <span
            className={cn(
              "hidden border-l pl-3 font-heading text-lg font-bold leading-none sm:inline",
              isDark
                ? "border-[color-mix(in_oklab,var(--pip-gold)_55%,transparent)] text-[var(--pip-cream)]"
                : "border-border text-foreground",
            )}
          >
            {title}
          </span>
        )}
      </div>
      <Link
        href={backHref}
        className={cn(
          "shrink-0 text-sm font-medium underline-offset-4 hover:underline",
          isDark
            ? "text-[var(--pip-cream)]/75 hover:text-[var(--pip-cream)]"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        {backLabel}
      </Link>
    </header>
  );
}
