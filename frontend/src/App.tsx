import { useEffect } from "react";

import { AppHeader } from "./components/AppHeader";
import { Skeleton } from "./components/ui/Skeleton";
import { AuthScreen } from "./features/auth/AuthScreen";
import { ForecastPage } from "./features/forecast/ForecastPage";
import { useSession } from "./hooks/useSession";
import { applyTheme, getStoredTheme } from "./lib/theme";

export default function App() {
  const session = useSession();

  useEffect(() => {
    applyTheme(getStoredTheme());
  }, []);

  if (session.status === "loading") {
    return (
      <main className="shell" aria-busy="true">
        <Skeleton />
      </main>
    );
  }

  if (session.status === "anonymous" || !session.user) {
    return (
      <main className="shell">
        <AuthScreen onAuthenticated={session.setUser} sessionExpired={session.sessionExpired} />
      </main>
    );
  }

  return (
    <>
      <AppHeader user={session.user} onLoggedOut={() => session.setUser(null)} />
      <main className="shell">
        <ForecastPage onSessionExpired={session.markExpired} />
      </main>
    </>
  );
}
