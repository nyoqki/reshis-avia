import { useCallback, useEffect, useState } from "react";

import { ApiError, api } from "../api/client";
import type { UserOut } from "../api/types";

export type SessionStatus = "loading" | "anonymous" | "authenticated";

export function useSession() {
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [user, setUserState] = useState<UserOut | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .me()
      .then((u) => {
        if (cancelled) return;
        setUserState(u);
        setStatus("authenticated");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        // 401 is the normal anonymous case; any other failure also lands on the login screen
        if (!(e instanceof ApiError)) console.error(e);
        setUserState(null);
        setStatus("anonymous");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setUser = useCallback((u: UserOut | null) => {
    setUserState(u);
    setStatus(u ? "authenticated" : "anonymous");
    if (u) setSessionExpired(false);
  }, []);

  const markExpired = useCallback(() => {
    setUserState(null);
    setStatus("anonymous");
    setSessionExpired(true);
  }, []);

  return { status, user, setUser, sessionExpired, markExpired };
}
