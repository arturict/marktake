import { useState } from "react";
import type { SessionInfo } from "@marktake/shared";
import { api } from "../api.js";
import { Brand } from "./Brand.js";

export function GuestGate({
  token,
  onSuccess,
}: {
  token: string;
  onSuccess: (session: SessionInfo) => void;
}): React.JSX.Element {
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <main className="auth-shell guest-auth">
      <section className="auth-card">
        <Brand />
        <div className="eyebrow">Guest review</div>
        <h1>One name, then straight to the cut.</h1>
        <p>Your name labels comments and decisions. No account is created.</p>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError("");
            try {
              onSuccess(
                await api<SessionInfo>("/api/guest/exchange", {
                  method: "POST",
                  body: JSON.stringify({
                    token,
                    displayName,
                    ...(password ? { password } : {}),
                  }),
                }),
              );
            } catch (reason) {
              setError(
                reason instanceof Error ? reason.message : "Link access failed.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Your name
            <input
              autoComplete="name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              maxLength={80}
              required
              autoFocus
            />
          </label>
          <label>
            Review password <span className="label-hint">if provided</span>
            <input
              autoComplete="current-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error && <div className="error-banner">{error}</div>}
          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? "Opening…" : "Open review"}
          </button>
        </form>
      </section>
      <aside className="auth-aside">
        <div>
          <span className="signal-dot" />
          Private review link
        </div>
        <p className="auth-quote">
          Pause on the frame. Mark what you mean. Leave one unambiguous note.
        </p>
        <p className="muted">
          This server is operated by the person who sent you the link. Marktake does not
          send the media to a third party.
        </p>
      </aside>
    </main>
  );
}
