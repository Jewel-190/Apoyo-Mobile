import { Stack, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as NavigationBar from "expo-navigation-bar";
import { useEffect } from "react";
import { Platform, AppState, View, StyleSheet } from "react-native";
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_400Regular_Italic } from "@expo-google-fonts/inter/400Regular_Italic";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { Inter_700Bold } from "@expo-google-fonts/inter/700Bold";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";

import { supabase } from "@/AppCore/SupabaseClient";
import { readPinRecoveryPending } from "@/AppCore/ForgotPin";
import { syncStatusApplicationsWithServer } from "@/AppCore/StatusApplicationsRepository";
import { hydrateCatalogRuntimeFromCache } from "@/AppCore/UseAssistanceCatalog";
import { NotificationsProvider } from "@/AppCore/NotificationsContext";
import BottomNavBar, {
  isMainTabPath,
  tabMaskColor,
} from "@/components/BottomNavBar";
import { AppBackGate } from "@/components/AppBackGate";
import { AuthEmailLinkGate } from "@/components/AuthEmailLinkGate";
import { PinRecoveryGate } from "@/components/PinRecoveryGate";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_400Regular_Italic,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded]);

  useEffect(() => {
    void (async () => {
      await hydrateCatalogRuntimeFromCache();
      if (await readPinRecoveryPending()) return;
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (user && !user.email_confirmed_at) {
        await supabase.auth.signOut({ scope: "local" });
        return;
      }
      const uid = user?.id;
      if (uid) {
        void syncStatusApplicationsWithServer(uid).catch(() => {});
      }
    })();
  }, []);

  useEffect(() => {
    const applyNavBarStyle = async () => {
      if (Platform.OS === "android") {
        await NavigationBar.setPositionAsync("relative");
        await NavigationBar.setBackgroundColorAsync("#008E8A");
        await NavigationBar.setButtonStyleAsync("light");
      }
    };

    applyNavBarStyle();

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        setTimeout(applyNavBarStyle, 150);
      }
    });

    return () => subscription.remove();
  }, []);

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: "#008E8A" }} />;
  }

  return (
    <NotificationsProvider>
      <PinRecoveryGate />
      <AuthEmailLinkGate />
      <AppBackGate />
      <RootChrome />
    </NotificationsProvider>
  );
}

const TAB_SCREEN_OPTIONS = {
  animation: "fade" as const,
  animationDuration: 160,
  animationTypeForReplace: "push" as const,
  gestureEnabled: false,
};

const LEGAL_MODAL_OPTIONS = {
  presentation: "transparentModal" as const,
  animation: "none" as const,
  headerShown: false,
  contentStyle: { backgroundColor: "transparent" },
  freezeOnBlur: true,
};

function AppStack() {
  return (
    <Stack
      screenOptions={{ headerShown: false }}
      initialRouteName="index"
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="Home/Home" options={TAB_SCREEN_OPTIONS} />
      <Stack.Screen name="Status/Status" options={TAB_SCREEN_OPTIONS} />
      <Stack.Screen name="Notification/Notifications" options={TAB_SCREEN_OPTIONS} />
      <Stack.Screen name="Account/Account" options={TAB_SCREEN_OPTIONS} />
      <Stack.Screen name="phase1/legal/[slug]" options={LEGAL_MODAL_OPTIONS} />
      <Stack.Screen name="Account/TermsAndConditions" options={LEGAL_MODAL_OPTIONS} />
      <Stack.Screen name="Account/UserAcceptance" options={LEGAL_MODAL_OPTIONS} />
      <Stack.Screen
        name="phase1/register"
        options={{
          animation: "fade",
          animationDuration: 220,
        }}
      />
      <Stack.Screen
        name="phase1/forgot-pin"
        options={{
          animation: "fade",
          animationDuration: 220,
          gestureEnabled: false,
        }}
      />
    </Stack>
  );
}

function RootChrome() {
  const pathname = usePathname();
  const showTabBar = isMainTabPath(pathname);

  return (
    <View style={styles.root}>
      <StatusBar style="light" backgroundColor="#008E8A" translucent={false} />
      <AppStack />
      {showTabBar ? <BottomNavBar maskColor={tabMaskColor(pathname)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
