import Script from "next/script";

const DEFAULT_ID = "108223264";

function getCounterId(): string | null {
  const raw = process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID?.trim();
  if (raw === "" || raw === "0" || raw === "false") {
    return null;
  }
  const id = raw || DEFAULT_ID;
  if (!/^\d+$/.test(id)) {
    return null;
  }
  return id;
}

/**
 * Counter snippet aligned with Yandex.Metrica docs (tag.js without id in URL; init via ym).
 * Uses `afterInteractive` like the default HTML installation. Disable in dev unless NEXT_PUBLIC_YANDEX_METRIKA_ENABLED=1.
 */
export function YandexMetrika() {
  const id = getCounterId();
  if (!id) {
    return null;
  }

  const enabledInDev = process.env.NEXT_PUBLIC_YANDEX_METRIKA_ENABLED === "1";
  if (process.env.NODE_ENV === "development" && !enabledInDev) {
    return null;
  }

  return (
    <>
      <Script id="yandex-metrika" strategy="afterInteractive">
        {`
(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
m[i].l=1*new Date();
k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
(window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");

ym(${id}, "init", {
  clickmap:true,
  trackLinks:true,
  accurateTrackBounce:true,
  webvisor:true,
  ecommerce:"dataLayer"
});
        `.trim()}
      </Script>
      <noscript>
        <div>
          <img
            src={`https://mc.yandex.ru/watch/${id}`}
            style={{ position: "absolute", left: "-9999px" }}
            alt=""
          />
        </div>
      </noscript>
    </>
  );
}
