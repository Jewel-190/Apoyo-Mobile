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

  /** PersonalInformation screen — split fields. */
  userName: "apoyo_user_name",
  userPhone: "apoyo_user_phone",
  userEmail: "apoyo_user_email",

  /** Status screen list of submitted applications. */
  statusApplicationsV1: "apoyo_status_applications_v1",

  /** Notification preferences (set in NotificationSettings). */
  pushEnabled: "apoyo_notif_push_enabled",
  inAppEnabled: "apoyo_notif_inapp_enabled",

  /** Registration draft (phase1/register). */
  regFullname: "apoyo_reg_fullname",
  regEmail: "apoyo_reg_email",
  regMobile: "apoyo_reg_mobile",
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
