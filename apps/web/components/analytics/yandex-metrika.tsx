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
 * Yandex.Metrica loaded with `lazyOnload` so it does not compete with LCP / main-thread work.
 * Disabled in development unless NEXT_PUBLIC_YANDEX_METRIKA_ENABLED=1.
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
      <Script id="yandex-metrika" strategy="lazyOnload">
        {`
(function(m,e,t,r,i,k,a){
  m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
  m[i].l=1*new Date();
  for (var j = 0; j < document.scripts.length; j++) { if (document.scripts[j].src === r) { return; } }
  k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
})(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js?id=${id}', 'ym');
ym(${id}, 'init', { ssr:true, webvisor:true, clickmap:true, ecommerce:"dataLayer", referrer: document.referrer, url: location.href, accurateTrackBounce:true, trackLinks:true });
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
