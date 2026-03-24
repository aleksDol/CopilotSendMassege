import Link from "next/link";
import { SERVICE_DISPLAY_NAME } from "@/lib/constants/service";

const legalLinkClass =
  "text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline";

type SiteFooterProps = {
  variant?: "full" | "compact";
};

export function SiteFooter({ variant = "full" }: SiteFooterProps) {
  const year = new Date().getFullYear();
  const isCompact = variant === "compact";

  return (
    <footer
      className={
        isCompact
          ? "mt-8 border-t border-border pt-6 text-center"
          : "border-t border-border bg-background/60"
      }
    >
      <div
        className={
          isCompact
            ? "space-y-3 text-xs text-muted-foreground"
            : "mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 md:flex-row md:items-center md:justify-between md:px-8"
        }
      >
        <nav
          className={
            isCompact
              ? "flex flex-wrap items-center justify-center gap-x-4 gap-y-2"
              : "flex flex-wrap items-center gap-x-6 gap-y-2 text-sm"
          }
          aria-label="Юридическая информация"
        >
          <Link href="/offer" className={legalLinkClass}>
            Оферта
          </Link>
          <Link href="/privacy" className={legalLinkClass}>
            Политика конфиденциальности
          </Link>
          <Link href="/personal-data" className={legalLinkClass}>
            Обработка персональных данных
          </Link>
        </nav>
        <p className={isCompact ? "text-[11px] text-muted-foreground/90" : "text-xs text-muted-foreground md:text-right"}>
          © {year} {SERVICE_DISPLAY_NAME}
        </p>
      </div>
    </footer>
  );
}
