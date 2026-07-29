import { useCallback, useEffect, useState } from "react";
import type { SessionInfo } from "@marktake/shared";
import { api, loadSession, setCsrfToken } from "./api.js";
import { AdminHome } from "./components/AdminHome.js";
import { GuestGate } from "./components/GuestGate.js";
import { Login } from "./components/Login.js";
import { ReviewRoom } from "./components/ReviewRoom.js";

function reviewTokenFromHash(): string | null {
  const match = /^#\/review\/([A-Za-z0-9_-]{32,256})$/u.exec(window.location.hash);
  return match?.[1] ?? null;
}

export function App(): React.JSX.Element {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [reviewProjectId, setReviewProjectId] = useState<string | null>(null);
  const [token] = useState(reviewTokenFromHash);

  const refreshSession = useCallback(async () => {
    setSession(await loadSession());
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const logout = async (): Promise<void> => {
    await api("/api/auth/logout", { method: "POST" });
    setCsrfToken(undefined);
    setSession({ authenticated: false });
    setReviewProjectId(null);
  };

  if (!session) {
    return (
      <main className="center-shell" aria-busy="true">
        <div className="brand-mark" aria-hidden="true">
          M
        </div>
        <p className="muted">Opening review room…</p>
      </main>
    );
  }

  if (token && (!session.authenticated || session.kind !== "guest")) {
    return (
      <GuestGate
        token={token}
        onSuccess={(next) => {
          window.history.replaceState(null, "", `${window.location.pathname}#/review`);
          setCsrfToken(next.csrfToken);
          setSession(next);
        }}
      />
    );
  }

  if (!session.authenticated) {
    return (
      <Login
        onSuccess={(next) => {
          setCsrfToken(next.csrfToken);
          setSession(next);
        }}
      />
    );
  }

  if (session.kind === "guest") {
    return <ReviewRoom session={session} onExit={() => void logout()} />;
  }

  if (reviewProjectId) {
    return (
      <ReviewRoom
        session={session}
        projectId={reviewProjectId}
        onExit={() => setReviewProjectId(null)}
      />
    );
  }

  return (
    <AdminHome
      session={session}
      onReview={setReviewProjectId}
      onLogout={() => void logout()}
    />
  );
}
