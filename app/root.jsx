import { useEffect } from "react";
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import { reportClientError } from "../src/services/api";

export default function App() {
  useEffect(() => {
    const handleError = (event) => {
      const error = event.error;
      let source = '';
      if (event.filename) {
        try {
          source = new URL(event.filename, window.location.href).pathname;
        } catch {
          source = 'unknown source';
        }
      }
      reportClientError({
        category: 'window-error',
        message: error?.message || event.message || 'Uncaught browser error',
        stack: error?.stack,
        source: source
          ? `${source}:${event.lineno || 0}:${event.colno || 0}`
          : '',
      });
    };
    const handleRejection = (event) => {
      const reason = event.reason;
      reportClientError({
        category: 'unhandled-rejection',
        message: reason?.message || String(reason || 'Unhandled promise rejection'),
        stack: reason?.stack,
      });
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Abril+Fatface&family=Anton&family=Archivo+Black&family=Bangers&family=Bebas+Neue&family=Caveat:wght@600;700&family=Cinzel:wght@600;700;800&family=Cormorant+Garamond:wght@600;700&family=Courgette&family=Creepster&family=DM+Serif+Display&family=Dancing+Script:wght@600;700&family=Great+Vibes&family=Inter:wght@400;600;700&family=Kalam:wght@700&family=Kanit:wght@500;700;800&family=Lato:wght@400;700&family=Lobster&family=Lora:wght@500;600;700&family=Merriweather:wght@400;700&family=Monoton&family=Montserrat:wght@400;600;700;800&family=Open+Sans:wght@400;600;700&family=Oswald:wght@500;600;700&family=Pacifico&family=Permanent+Marker&family=Playfair+Display:ital,wght@0,600;0,700;1,600&family=Plus+Jakarta+Sans:wght@400;600;700;800&family=Poppins:wght@400;600;700;800&family=Prata&family=Press+Start+2P&family=Raleway:wght@400;600;700&family=Righteous&family=Roboto:wght@400;500;700&family=Rye&family=Sacramento&family=Satisfy&family=Special+Elite&family=Syne:wght@600;700;800&family=Yellowtail&display=swap"
        />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
