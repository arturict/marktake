import { useState } from "react";
import type { SessionInfo } from "@marktake/shared";
import { api } from "../api.js";
import { Brand } from "./Brand.js";

export function Login({
  onSuccess,
}: {
  onSuccess: (session: SessionInfo) => void;
}): React.JSX.Element {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <Brand />
        <div className="eyebrow">Owner access</div>
        <h1>Your review server, on your storage.</h1>
        <p>
          Sign in with the administrator password configured on this Marktake instance.
        </p>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError("");
            try {
              onSuccess(
                await api<SessionInfo>("/api/auth/login", {
                  method: "POST",
                  body: JSON.stringify({ password }),
                }),
              );
            } catch (reason) {
              setError(reason instanceof Error ? reason.message : "Sign-in failed.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Administrator password
            <input
              autoComplete="current-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              autoFocus
            />
          </label>
          {error && <div className="error-banner">{error}</div>}
          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? "Signing in…" : "Open workspace"}
          </button>
        </form>
      </section>
      <aside className="auth-aside" aria-label="Product boundaries">
        <div>
          <span className="signal-dot" />
          One container · one data volume
        </div>
        <p className="auth-quote">
          No cloud library to maintain. Just the cut, the feedback, and a clear
          decision.
        </p>
        <ul>
          <li>Browser-ready MP4 and WebM only</li>
          <li>Metadata-stripped review copies</li>
          <li>No telemetry or external assets</li>
        </ul>
      </aside>
    </main>
  );
}
