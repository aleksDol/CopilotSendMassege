import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type LegalPageLayoutProps = {
  title: string;
  /** Optional line under the title (e.g. short description). */
  subtitle?: string;
  /** e.g. last updated date */
  updatedLabel?: string;
  /** Shown above the title row; default true */
  showBackLink?: boolean;
  children: ReactNode;
  className?: string;
};

const backLinkClass =
  "group mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm";

/**
 * Reusable SaaS-style shell for long-form legal pages: readable measure, vertical rhythm, prose defaults.
 * Document markup lives in `components/legal/content/*`; this component only provides layout + typography scope.
 */
export function LegalPageLayout({
  title,
  subtitle,
  updatedLabel,
  showBackLink = true,
  children,
  className
}: LegalPageLayoutProps) {
  return (
    <main className={cn("flex-1", className)}>
      <div className="border-b border-border/60 bg-gradient-to-b from-muted/25 to-background">
        <div className="mx-auto w-full max-w-6xl px-4 pb-2 pt-6 sm:px-6 sm:pt-8 md:px-8">
          <div className="mx-auto max-w-3xl">
            {showBackLink ? (
              <Link href="/home" className={backLinkClass}>
                <ChevronLeft
                  className="h-4 w-4 shrink-0 transition-transform group-hover:-translate-x-0.5"
                  aria-hidden
                />
                На главную
              </Link>
            ) : null}

            <header className="border-b border-border pb-8 md:pb-10">
              <h1 className="text-balance text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl md:text-[2rem] md:leading-snug">
                {title}
              </h1>
              {subtitle ? (
                <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-[1.05rem]">{subtitle}</p>
              ) : null}
              {updatedLabel ? (
                <p className="mt-4 inline-flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span className="h-px w-8 bg-border" aria-hidden />
                  <span>{updatedLabel}</span>
                </p>
              ) : null}
            </header>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10 md:px-8 md:py-12">
        <div className="mx-auto max-w-3xl">
          <div
            className={cn(
              "legal-prose text-[15px] leading-[1.7] text-muted-foreground sm:text-base sm:leading-[1.75]",
              /* Paragraphs */
              "[&_p]:mb-4 [&_p]:last:mb-0",
              /* Headings */
              "[&_h2]:mb-3 [&_h2]:mt-12 [&_h2]:scroll-mt-28 [&_h2]:text-balance [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:leading-snug [&_h2]:tracking-tight [&_h2]:text-foreground",
              "[&_h2]:first:mt-0",
              "[&_h3]:mb-2 [&_h3]:mt-9 [&_h3]:scroll-mt-28 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:leading-snug [&_h3]:text-foreground",
              "[&_h4]:mb-2 [&_h4]:mt-7 [&_h4]:text-sm [&_h4]:font-semibold [&_h4]:uppercase [&_h4]:tracking-wide [&_h4]:text-muted-foreground",
              /* Lists */
              "[&_ul]:my-4 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5",
              "[&_ol]:my-4 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-5",
              "[&_li]:pl-1 [&_li]:marker:text-muted-foreground/80",
              "[&_li>ul]:my-2 [&_li>ol]:my-2",
              /* Links */
              "[&_a]:font-medium [&_a]:text-primary [&_a]:underline-offset-4 [&_a]:transition-colors hover:[&_a]:underline",
              /* Emphasis */
              "[&_strong]:font-semibold [&_strong]:text-foreground",
              "[&_b]:font-semibold [&_b]:text-foreground",
              "[&_em]:italic",
              /* Horizontal rule */
              "[&_hr]:my-10 [&_hr]:border-0 [&_hr]:border-t [&_hr]:border-border",
              /* Blockquote */
              "[&_blockquote]:my-6 [&_blockquote]:border-l-2 [&_blockquote]:border-primary/35 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground",
              /* Code */
              "[&_code]:rounded-md [&_code]:bg-muted/80 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.8125rem] [&_code]:text-foreground",
              "[&_pre]:my-5 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:border [&_pre]:border-border [&_pre]:bg-muted/40 [&_pre]:p-4 [&_pre]:text-sm",
              "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
              /* Tables (if used in pasted legal HTML later) */
              "[&_table]:my-6 [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm",
              "[&_th]:border-b [&_th]:border-border [&_th]:bg-muted/40 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_th]:text-foreground",
              "[&_td]:border-b [&_td]:border-border/80 [&_td]:px-3 [&_td]:py-2",
              /* Sections from content files */
              "[&_section]:scroll-mt-24"
            )}
            lang="ru"
          >
            {children}
          </div>
        </div>
      </div>
    </main>
  );
}
