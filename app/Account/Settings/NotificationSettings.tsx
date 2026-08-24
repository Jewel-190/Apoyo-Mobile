import React, { useEffect, useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";

import {
  getInAppPreference,
  getPushPreference,
  registerForPushNotificationsAsync,
  setInAppPreference,
  setPushPreference,
} from "@/AppCore/PushNotifications";
import {
  ACCOUNT_BORDER,
  ACCOUNT_FONT,
  ACCOUNT_MUTED,
  ACCOUNT_TEAL,
  ACCOUNT_TEXT,
  AccountSectionLabel,
  AccountSubpage,
} from "@/components/AccountUi";

export default function NotificationSettings() {
  const [pushEnabled, setPushEnabled] = useState(true);
  const [inAppEnabled, setInAppEnabled] = useState(true);

  useEffect(() => {
    (async () => {
      setPushEnabled(await getPushPreference());
      setInAppEnabled(await getInAppPreference());
    })();
  }, []);

  const togglePush = async (val: boolean) => {
    setPushEnabled(val);
    await setPushPreference(val);
    if (val) {
      void registerForPushNotificationsAsync();
    }
  };

  const toggleInApp = async (val: boolean) => {
    setInAppEnabled(val);
    await setInAppPreference(val);
  };

  return (
    <AccountSubpage title="Notification Settings" showHome scroll>
      <AccountSectionLabel>NOTIFICATIONS</AccountSectionLabel>
      <Text style={styles.sectionDesc}>
        Customize your notification settings to control what alerts you receive.
      </Text>

      <View style={styles.divider} />
      <Text style={styles.settingLabel}>Push Notification</Text>
      <View style={styles.settingRow}>
        <Text style={styles.settingDesc}>
          Receive important updates and alerts directly on your device, even when
          the app isn't open.
        </Text>
        <Switch
          value={pushEnabled}
          onValueChange={togglePush}
          trackColor={{ false: "#D0D8D8", true: ACCOUNT_TEAL }}
          thumbColor="#FFFFFF"
          ios_backgroundColor="#D0D8D8"
          style={styles.switch}
        />
      </View>

      <View style={styles.divider} />
      <Text style={styles.settingLabel}>In-App Notification</Text>
      <View style={styles.settingRow}>
        <Text style={styles.settingDesc}>
          Get timely messages and alerts within the app itself.
        </Text>
        <Switch
          value={inAppEnabled}
          onValueChange={toggleInApp}
          trackColor={{ false: "#D0D8D8", true: ACCOUNT_TEAL }}
          thumbColor="#FFFFFF"
          ios_backgroundColor="#D0D8D8"
          style={styles.switch}
        />
      </View>
      <View style={styles.divider} />
    </AccountSubpage>
  );
}

const styles = StyleSheet.create({
  sectionDesc: {
    fontFamily: ACCOUNT_FONT,
    fontWeight: "400",
    fontSize: 14,
    color: ACCOUNT_MUTED,
    lineHeight: 18,
    marginBottom: 8,
  },
  divider: {
    height: 1,
    backgroundColor: ACCOUNT_BORDER,
    marginBottom: 16,
  },
  settingLabel: {
    fontFamily: ACCOUNT_FONT,
    fontWeight: "400",
    fontSize: 14,
    color: ACCOUNT_MUTED,
    marginBottom: 10,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 18,
  },
  settingDesc: {
    flex: 1,
    fontFamily: ACCOUNT_FONT,
    fontWeight: "600",
    fontSize: 14,
    color: ACCOUNT_TEAL,
    lineHeight: 19,
  },
  switch: {
    transform: [{ scaleX: 0.9 }, { scaleY: 0.9 }],
  },
});
