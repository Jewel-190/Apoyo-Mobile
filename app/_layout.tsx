import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as NavigationBar from "expo-navigation-bar";
import { useEffect } from "react";
import { Platform, AppState } from "react-native";

export default function RootLayout() {
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
        <Stack.Screen name="Notification/Notification" options={{ animation: "none" }} />
        <Stack.Screen name="Account/Account" options={{ animation: "none" }} />
      </Stack>
    </>
  );
}
