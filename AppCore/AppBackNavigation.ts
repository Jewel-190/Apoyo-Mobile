/**
 * Android system-back policy (no UI).
 *
 * Nested screens pop. Other main tabs return to Home. Home (authenticated
 * root) asks to log out instead of leaving the session silently.
 * Unauthenticated roots may exit the app.
 */

import { ROUTES } from "./AppRoutePaths";

export type AppBackAction = "pop" | "home" | "logout" | "exit";

function normalizePath(path: string): string {
  return path.replace(/\/+$/, "").trim().toLowerCase() || "/";
}

const HOME = normalizePath(ROUTES.home);
const MAIN_TABS = new Set([
  HOME,
  normalizePath(ROUTES.status),
  normalizePath(ROUTES.notifications),
  normalizePath(ROUTES.account),
]);

const AUTH_FLOW_EXACT = new Set([
  normalizePath(ROUTES.index),
  normalizePath(ROUTES.onboarding),
  normalizePath(ROUTES.login),
  normalizePath(ROUTES.register),
  normalizePath(ROUTES.forgotPin),
]);

function isAuthFlowPath(path: string): boolean {
  if (AUTH_FLOW_EXACT.has(path)) return true;
  return path.startsWith("/phase1/legal");
}

export function resolveAppBackAction(
  pathname: string,
  canGoBack: boolean
): AppBackAction {
  const path = normalizePath(pathname);

  if (MAIN_TABS.has(path)) {
    return path === HOME ? "logout" : "home";
  }

  if (isAuthFlowPath(path)) {
    return canGoBack ? "pop" : "exit";
  }

  return canGoBack ? "pop" : "home";
}
