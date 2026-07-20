"use client";

/**
 * Root-layout error boundary. This replaces the entire document, so globals.css
 * is NOT loaded here — everything must be inline styles.
 */
export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          background: "#08090b",
          color: "#f2f4f6",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          textAlign: "center",
          padding: 24,
        }}
      >
        <p style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>
          Mizan hit an unexpected error.
        </p>
        <p style={{ fontSize: 12.5, color: "#9aa3af", maxWidth: 360, margin: 0 }}>
          Your data is safe on the server. Reload to get back in.
        </p>
        <button
          onClick={reset}
          style={{
            background: "#f2f4f6",
            color: "#0b0c0f",
            border: 0,
            borderRadius: 12,
            padding: "10px 24px",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 2,
            cursor: "pointer",
          }}
        >
          RELOAD
        </button>
      </body>
    </html>
  );
}
