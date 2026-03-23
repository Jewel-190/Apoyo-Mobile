import { useRouter } from "expo-router";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function Index() {
  const router = useRouter();

  const handlePress = () => {
    router.push("/phase1/onboarding");
  };

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={handlePress}
      activeOpacity={1}
    >
      {/* Logo with background - perfectly centered */}
      <View style={styles.logoWrapper}>
        <Image
          source={require("../assets/images/rectangle.png")}
          style={styles.logoBackground}
        />
        <Image
          source={require("../assets/images/apoyologo.png")}
          style={styles.logoImage}
        />
      </View>

      {/* Single large text2.png image below logo + text below it */}
      <View style={styles.imagesContainer}>
        <Image
          source={require("../assets/images/text2.png")}
          style={styles.largeTextImage}
        />
        <Text style={styles.benefitsText}>
          Your benefits, now in your hands.
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#008B88",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },

  /* Logo styles - FIXED centering */
  logoWrapper: {
    width: 110,
    height: 110,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 32,
    position: "relative",
  },
  logoBackground: {
    width: "100%",
    height: "100%",
    resizeMode: "contain",
    position: "absolute",
  },
  logoImage: {
    marginTop: 5,
    marginRight: 5,
    width: 55,
    height: 75,
    resizeMode: "contain",
  },

  /* Images Section */
  imagesContainer: {
    alignItems: "center",
  },

  largeTextImage: {
    marginTop: -70,
    width: 130,
    height: 120,
    resizeMode: "contain",
  },

  benefitsText: {
    fontSize: 14,
    fontWeight: "800",
    color: "rgba(255, 255, 255, 0.48)", // Lessened white (30% opacity)
    textAlign: "center",
    marginTop: -38,
    letterSpacing: -1, // Space between characters (negative = tighter)

    // BLURRY STROKE - adapts to #008B88 background
    textShadowColor: "rgba(1, 1, 1, 0.91)", // Slightly stronger stroke for contrast
    textShadowOffset: { width: 1, height: 2 },
    textShadowRadius: 1,

    shadowColor: "rgba(255, 255, 255, 0.5)",
    shadowOffset: { width: 0.5, height: 0.5 },
    shadowOpacity: 1,
    shadowRadius: 1,

    includeFontPadding: false,
  },
});
