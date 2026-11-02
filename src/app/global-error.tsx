"use client";

/**
 * Last-resort error page when the root layout itself fails (no header, no translations available):
 * bilingual, self-contained styles, no external resources.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="de">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
          background: "#0b0b0c",
          color: "#f4f4f5",
          textAlign: "center",
          padding: "1rem",
        }}
      >
        <main role="alert" style={{ maxWidth: 520 }}>
          <h1 style={{ fontSize: "1.75rem", marginBottom: "0.5rem" }}>Da ist etwas schiefgelaufen</h1>
          <p style={{ opacity: 0.8, margin: "0 0 0.25rem" }}>tretu.de ist gerade nicht erreichbar. Versuch es gleich noch einmal.</p>
          <p lang="en" style={{ opacity: 0.6, margin: 0, fontSize: "0.9rem" }}>
            Something went wrong on tretu.de. Please try again in a moment.
          </p>
          {error.digest ? <p style={{ fontFamily: "monospace", fontSize: "0.75rem", opacity: 0.5 }}>{error.digest}</p> : null}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              padding: "0.6rem 1.2rem",
              border: 0,
              borderRadius: 6,
              background: "#ed6f1a",
              color: "#fff",
              fontSize: "1rem",
              cursor: "pointer",
            }}
          >
            Erneut versuchen / Try again
          </button>
        </main>
      </body>
    </html>
  );
}
