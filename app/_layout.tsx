import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as NavigationBar from "expo-navigation-bar";
import { useEffect } from "react";
import { Platform, AppState, View } from "react-native";
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_400Regular_Italic } from "@expo-google-fonts/inter/400Regular_Italic";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { Inter_700Bold } from "@expo-google-fonts/inter/700Bold";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";

import { supabase } from "@/AppCore/SupabaseClient";
import { syncStatusApplicationsWithServer } from "@/AppCore/StatusApplicationsRepository";
import { hydrateCatalogRuntimeFromCache } from "@/AppCore/UseAssistanceCatalog";

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
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user?.id;
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
    <>
      <StatusBar style="light" backgroundColor="#008E8A" translucent={false} />
      <Stack
        screenOptions={{ headerShown: false }}
        initialRouteName="index"
      >
        {/* Main navbar screens - instant transitions for seamless tab switching */}
        <Stack.Screen name="index" />
        <Stack.Screen name="Home/Home" options={{ animation: "none" }} />
        <Stack.Screen name="Status/Status" options={{ animation: "none" }} />
        <Stack.Screen name="Notification/Notifications" options={{ animation: "none" }} />
        <Stack.Screen name="Account/Account" options={{ animation: "none" }} />
      </Stack>
    </>
  );
}
