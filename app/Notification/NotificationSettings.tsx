import { Redirect } from "expo-router";

import { ROUTES } from "@/AppCore/AppRoutePaths";

/** Old path; Notification Settings now lives under Account → Settings. */
export default function NotificationSettingsRedirect() {
  return <Redirect href={ROUTES.notificationSettings} />;
}
