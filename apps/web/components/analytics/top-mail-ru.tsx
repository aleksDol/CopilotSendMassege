import Script from "next/script";

const DEFAULT_ID = "3752150";

function getCounterId(): string | null {
  const raw = process.env.NEXT_PUBLIC_TOP_MAIL_RU_ID?.trim();
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
 * Top.Mail.Ru counter — standard loader; `afterInteractive` matches typical counter installation.
 * Disabled in development unless NEXT_PUBLIC_TOP_MAIL_RU_ENABLED=1.
 */
export function TopMailRu() {
  const id = getCounterId();
  if (!id) {
    return null;
  }

  const enabledInDev = process.env.NEXT_PUBLIC_TOP_MAIL_RU_ENABLED === "1";
  if (process.env.NODE_ENV === "development" && !enabledInDev) {
    return null;
  }

  return (
    <>
      <Script id="top-mail-ru" strategy="afterInteractive">
        {`
var _tmr = window._tmr || (window._tmr = []);
_tmr.push({id: "${id}", type: "pageView", start: (new Date()).getTime()});
(function (d, w, sid) {
  if (d.getElementById(sid)) return;
  var ts = d.createElement("script"); ts.type = "text/javascript"; ts.async = true; ts.id = sid;
  ts.src = "https://top-fwz1.mail.ru/js/code.js";
  var f = function () { var s = d.getElementsByTagName("script")[0]; s.parentNode.insertBefore(ts, s); };
  if (w.opera == "[object Opera]") { d.addEventListener("DOMContentLoaded", f, false); } else { f(); }
})(document, window, "tmr-code");
        `.trim()}
      </Script>
      <noscript>
        <div>
          <img
            src={`https://top-fwz1.mail.ru/counter?id=${id};js=na`}
            style={{ position: "absolute", left: "-9999px" }}
            alt="Top.Mail.Ru"
          />
        </div>
      </noscript>
    </>
  );
}
