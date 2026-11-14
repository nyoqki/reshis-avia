import { useEffect } from "react";

import { AppHeader } from "./components/AppHeader";
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
        <div className="skeleton" />
      </main>
    );
  }

  if (session.status === "anonymous" || !session.user) {
    return (
      <main className="shell">
        {/* AuthScreen slot (T11) */}
        <div data-slot="auth" />
      </main>
    );
  }

  return (
    <>
      <AppHeader user={session.user} />
      <main className="shell">
        {/* ForecastPage slot (T12) */}
        <div data-slot="forecast" />
      </main>
    </>
  );
}
