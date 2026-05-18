/**
 * Centralized route paths for expo-router.
 *
 * Existing screens still inline these strings (some with `as any` casts).
 * New code should import from here so renames are a one-line change.
 *
 * Values MUST exactly match the on-disk file paths under `app/`.
 */

export const ROUTES = {
  index: "/",

  onboarding: "/phase1/onboarding",
  login: "/phase1/login",
  register: "/phase1/register",

  home: "/Home/Home",
  requestInfo: "/Home/request/RequestInfo",
  approvedAssistance: "/Home/ApprovedAssistance",

  status: "/Status/Status",
  statusDetails: "/Status/StatusDetails",
  actionRequiredDetails: "/Status/ActionRequiredDetails",

  notifications: "/Notification/Notifications",
  notificationSettings: "/Notification/NotificationSettings",

  account: "/Account/Account",
  settings: "/Account/Settings",
  accountSettings: "/Account/AccountSettings",
  personalInformation: "/Account/PersonalInformation",
} as const;

export type AppRoute = (typeof ROUTES)[keyof typeof ROUTES];
