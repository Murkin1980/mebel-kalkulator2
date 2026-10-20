import { useCallback, useEffect } from "react";
import { navigate as hashNavigate, useHashLocation } from "wouter/use-hash-location";
import type { Path } from "wouter";

const ROUTE_INDEX_KEY = "__salamatCalcRouteIndex";

/** Small shared decision point used by the app's existing Wouter router. */
export function createUnsavedNavigationGuard(confirmLeave: () => boolean) {
  let blocker: (() => boolean) | null = null;
  let bypassDepth = 0;

  return {
    register(next: (() => boolean) | null) {
      blocker = next;
      return () => {
        if (blocker === next) blocker = null;
      };
    },
    canNavigate() {
      return bypassDepth > 0 || !blocker || blocker();
    },
    runBypassed<T>(action: () => T): T {
      bypassDepth += 1;
      try {
        return action();
      } finally {
        bypassDepth -= 1;
      }
    },
    confirmLeave,
  };
}

const navigationGuard = createUnsavedNavigationGuard(() =>
  window.confirm("Есть несохранённые изменения. Выйти без сохранения?"),
);

export function registerUnsavedNavigationBlocker(blocker: (() => boolean) | null): () => void {
  return navigationGuard.register(blocker);
}

/** Run a route change only after the change has been durably saved elsewhere. */
export function navigateAfterSave<T>(action: () => T): T {
  return navigationGuard.runBypassed(action);
}

function routeFromHash(): string {
  return `/${window.location.hash.replace(/^#?\/?/, "")}`;
}

function routeIndex(state: unknown): number | null {
  if (typeof state !== "object" || state === null) return null;
  const index = (state as Record<string, unknown>)[ROUTE_INDEX_KEY];
  return Number.isInteger(index) && Number(index) >= 0 ? Number(index) : null;
}

function stateWithRouteIndex(state: unknown, index: number): Record<string, unknown> {
  const preserved = typeof state === "object" && state !== null ? state : { wouterState: state };
  return { ...preserved, [ROUTE_INDEX_KEY]: index };
}

let hashListenerInstalled = false;
let approvedRoute: string | null = null;

function installHashNavigationGuard(): () => void {
  if (typeof window === "undefined") return () => undefined;

  let lastRoute = routeFromHash();
  let lastIndex = routeIndex(window.history.state) ?? 0;
  let restoringRoute: string | null = null;

  // Tag the current entry so Back and Forward can be safely reversed when the
  // user chooses to stay. Existing router state is preserved.
  if (routeIndex(window.history.state) === null) {
    window.history.replaceState(stateWithRouteIndex(window.history.state, lastIndex), "", window.location.href);
  }

  const onHashChange = (event: HashChangeEvent) => {
    const nextRoute = routeFromHash();
    const nextIndex = routeIndex(window.history.state);

    if (restoringRoute === nextRoute) {
      restoringRoute = null;
      lastRoute = nextRoute;
      lastIndex = nextIndex ?? lastIndex;
      return;
    }
    if (approvedRoute === nextRoute) {
      approvedRoute = null;
      lastRoute = nextRoute;
      lastIndex = nextIndex ?? lastIndex;
      return;
    }
    if (nextRoute === lastRoute) return;

    if (!navigationGuard.canNavigate()) {
      // First-listener position prevents Wouter from unmounting the editor
      // before the cancelled history traversal has been reversed.
      event.stopImmediatePropagation();
      const delta = nextIndex === null ? 0 : lastIndex - nextIndex;
      if (delta !== 0) {
        restoringRoute = lastRoute;
        window.history.go(delta);
      } else {
        restoringRoute = lastRoute;
        hashNavigate(lastRoute, {
          replace: true,
          state: stateWithRouteIndex(window.history.state, lastIndex),
        });
      }
      return;
    }

    lastRoute = nextRoute;
    lastIndex = nextIndex ?? lastIndex;
  };

  window.addEventListener("hashchange", onHashChange, true);
  hashListenerInstalled = true;
  return () => {
    window.removeEventListener("hashchange", onHashChange, true);
    hashListenerInstalled = false;
  };
}

// Browser Back/Forward must be vetoed before Wouter reacts to the same
// `hashchange`. Wouter's hash-location subscriber attaches on first React
// render, and handlers on `window` run in registration order — a listener
// registered later cannot preempt it (capture phase does not matter when the
// event target is `window` itself). Installing at module load guarantees the
// guard is the first hashchange listener, so a rejected traversal can call
// stopImmediatePropagation() before Wouter unmounts the editor.
if (typeof window !== "undefined") {
  installHashNavigationGuard();
}

/** Wouter-compatible hash hook that guards Link, navigate, Back and Forward. */
export function useGuardedHashLocation(options?: { ssrPath?: Path }): ReturnType<typeof useHashLocation> {
  const [location, navigate] = useHashLocation(options);

  useEffect(() => {
    if (hashListenerInstalled) return;
    return installHashNavigationGuard();
  }, []);

  const guardedNavigate = useCallback<typeof navigate>((to, options) => {
    const target = `/${to.replace(/^#?\/?/, "")}`;
    if (target === location || !navigationGuard.canNavigate()) return;

    const currentIndex = routeIndex(window.history.state) ?? 0;
    const nextIndex = options?.replace ? currentIndex : currentIndex + 1;
    approvedRoute = target;
    const state = stateWithRouteIndex(options?.state ?? window.history.state, nextIndex);
    navigate(to, { ...options, state });
  }, [location, navigate]);

  return [location, guardedNavigate];
}

// Preserve Wouter's hash-based href formatter for Link elements.
(useGuardedHashLocation as typeof useGuardedHashLocation & { hrefs?: (href: string) => string }).hrefs =
  (useHashLocation as typeof useHashLocation & { hrefs?: (href: string) => string }).hrefs;

/** Registers the editor's current dirty state with the app-wide Wouter hook. */
export function useUnsavedNavigationProtection(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) {
      navigationGuard.register(null);
      return;
    }
    const blocker = () => navigationGuard.confirmLeave();
    return registerUnsavedNavigationBlocker(blocker);
  }, [dirty]);
}
