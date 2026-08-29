/**
 * Centralized AsyncStorage key constants.
 *
 * Keys here are the *canonical* names already in use by existing screens.
 * Do NOT rename existing values without a migration: changing a key would
 * orphan user data on already-installed devices.
 *
 * Existing screens still hardcode some of these strings; new code should
 * import from here so future cache versioning is straightforward.
 */

export const STORAGE_KEYS = {
  /** Cached profile shown on Home/Account screens. */
  userCache: "apoyo_user_cache",

  /** Cached profile fields. */
  userName: "apoyo_user_name",
  userPhone: "apoyo_user_phone",
  userEmail: "apoyo_user_email",

  /** Status screen list of submitted applications. */
  statusApplicationsV1: "apoyo_status_applications_v1",

  /** Notification preferences (defaults on; no in-app settings UI yet). */
  pushEnabled: "apoyo_notif_push_enabled",
  inAppEnabled: "apoyo_notif_inapp_enabled",

  /** Registration draft (phase1/register). */
  regFullname: "apoyo_reg_fullname",
  regEmail: "apoyo_reg_email",
  regMobile: "apoyo_reg_mobile",

  /** Full multi-step registration snapshot (phase1/register). */
  registrationDraftV1: "apoyo_registration_draft_v1",

  /** Cached barangay dropdown (registration). */
  barangaysCache: "apoyo_barangays_v1",

  /** Cached CMS legal pages (`public.settings` system/legal). */
  legalSettingsCache: "apoyo_legal_settings_v1",

  /** Cached interview briefing (`public.settings` admin/interview-scheduling). */
  interviewSchedulingCache: "apoyo_interview_scheduling_v1",

  /** Cached About → Official channels (`web` public.get → about.channels). */
  officialChannelsCache: "apoyo_official_channels_v1",

  /** Local consent record for Terms + User Acceptance before register. */
  legalAcceptanceV1: "apoyo_legal_acceptance_v1",

  /** Recovery session: email verified via OTP, new MPIN not saved yet. */
  pinRecoveryPending: "apoyo_pin_recovery_pending_v1",
} as const;

/** Per-service form draft key used by RequestInfo + per-service Req screens. */
export function requestInfoDraftKey(serviceId: string): string {
  return `apoyo_requestinfo_${serviceId}`;
}

/**
 * Dedupe key used by per-service SubmissionSuccess screens to avoid
 * double-inserting the same application into the local Status list when
 * a user navigates back to the success screen.
 */
export function submissionSavedKey(applicationId: string): string {
  return `claret_saved_${applicationId}`;
}
