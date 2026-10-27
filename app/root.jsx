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
          href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;700&family=Pacifico&family=Playfair+Display:ital,wght@0,600;0,700;1,600&family=Poppins:wght@400;600;700;800&display=swap"
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
