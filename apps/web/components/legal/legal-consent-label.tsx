"use client";

import Link from "next/link";

const linkClass = "text-primary underline-offset-2 hover:underline";

/**
 * Inline consent copy for registration; links open in the same tab (standard for legal acceptance).
 */
export function LegalConsentLabel() {
  return (
    <span className="text-sm leading-snug text-muted-foreground">
      Я принимаю условия{" "}
      <Link href="/offer" className={linkClass}>
        оферты
      </Link>{" "}
      и{" "}
      <Link href="/privacy" className={linkClass}>
        политики конфиденциальности
      </Link>
      , а также даю согласие на{" "}
      <Link href="/personal-data" className={linkClass}>
        обработку персональных данных
      </Link>
      .
    </span>
  );
}
