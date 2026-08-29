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
  authCallback: "/auth-callback",
  legalTerms: "/phase1/legal/terms-and-conditions",
  legalUserAcceptance: "/phase1/legal/user-acceptance",

  home: "/Home/Home",
  requestInfo: "/Home/request/RequestInfo",
  approvedAssistance: "/Home/ApprovedAssistance",

  status: "/Status/Status",
  statusDetails: "/Status/StatusDetails",
  actionRequiredDetails: "/Status/ActionRequiredDetails",

  notifications: "/Notification/Notifications",

  account: "/Account/Account",
  manageAccount: "/Account/ManageAccount",
  termsAndConditions: "/Account/TermsAndConditions",
  userAcceptance: "/Account/UserAcceptance",
  contactUs: "/Account/ContactUs",
  changePin: "/Account/Settings/ChangePin",
  forgotPin: "/phase1/forgot-pin",
} as const;

export type AppRoute = (typeof ROUTES)[keyof typeof ROUTES];
