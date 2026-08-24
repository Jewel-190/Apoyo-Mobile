import { router } from "expo-router";
import React, { useMemo, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const { width, height } = Dimensions.get("window");
const TEAL = "#0B8F8B";

type Slide = {
  key: string;
  image: any;
  title: string;
  desc: string;
};

export default function Onboarding() {
  const slides: Slide[] = useMemo(
    () => [
      {
        key: "1",
        image: require("../../assets/images/group1.png"),
        title: "A Better Way to Access Benefits",
        desc: "Welcome to your streamlined hub for voters benefit assistance. From daily needs to future security, help is now just a tap away.",
      },
      {
        key: "2",
        image: require("../../assets/images/group2.png"),
        title: "Financial Aid at\nYour Fingertips.",
        desc: "Skip the paperwork. Apply for financial benefits and track your progress from start to finish, all in one place.",
      },
      {
        key: "3",
        image: require("../../assets/images/group3.png"),
        title: "Your Health, Our Priority.",
        desc: "Access medical assistance and coverage vital to your well-being. Quality healthcare support is now in your hands.",
      },
      {
        key: "4",
        image: require("../../assets/images/group4.png"),
        title: "Dignified Support\nWhen It Matters Most.",
        desc: "Providing compassionate assistance and peace of mind for families facing final expenses during difficult times.",
      },
    ],
    []
  );

  const listRef = useRef<FlatList<Slide>>(null);
  const [index, setIndex] = useState(0);

  const goTo = (i: number) => {
    const clamped = Math.max(0, Math.min(i, slides.length - 1));
    listRef.current?.scrollToOffset({
      offset: clamped * width,
      animated: true,
    });
    setIndex(clamped);
  };

  const goNext = () => {
    if (index < slides.length - 1) {
      goTo(index + 1);
      return;
    }

    if (__DEV__) {
      console.log("Get Started pressed -> /phase1/login");
    }
    router.push("/phase1/login");
  };

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const newIndex = Math.round(e.nativeEvent.contentOffset.x / width);
    setIndex(newIndex);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {/* Background blobs */}
        <View style={styles.blobLeft} />
        <View style={styles.blobRight} />

        <View style={styles.headerBrandRow}>
          <Image
            source={require("../../assets/images/Dasmariñas Logo.png")}
            style={styles.headerCityLogo}
            resizeMode="contain"
          />
          <Image
            source={require("../../assets/images/Dasmariñas Banner.png")}
            style={styles.headerSeal}
            resizeMode="contain"
          />
        </View>

        {/* Apoyo logo */}
        <Image
          source={require("../../assets/images/apoyo2.png")}
          style={styles.logo}
          resizeMode="contain"
        />

        {/* Slides area (give it real space) */}
        <View style={styles.slidesArea}>
          <FlatList
            ref={listRef}
            data={slides}
            keyExtractor={(item) => item.key}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onScrollEnd}
            contentContainerStyle={{ paddingBottom: 140 }} // space for button
            renderItem={({ item }) => (
              <View style={[styles.slide, { width }]}>
                <TouchableOpacity activeOpacity={0.9} onPress={goNext}>
                  <Image
                    source={item.image}
                    style={styles.hero}
                    resizeMode="contain"
                  />
                </TouchableOpacity>

                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.desc}>{item.desc}</Text>
              </View>
            )}
          />
        </View>

        {/* Dots */}
        <View style={styles.dotsRow}>
          {slides.map((_, i) => {
            const active = i === index;
            return (
              <TouchableOpacity
                key={i}
                activeOpacity={0.8}
                onPress={() => goTo(i)}
                style={[styles.dot, active && styles.dotActive]}
              />
            );
          })}
        </View>

        {/* Bottom button ABSOLUTE (so it will always be clickable) */}
        <View style={styles.bottomFixed}>
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={goNext}
            style={styles.btnWrap}
          >
            <Text style={styles.btnText}>
              {index < slides.length - 1 ? "Next" : "Get Started"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#FFFFFF" },
  container: { flex: 1, backgroundColor: "#FFFFFF" },

  blobLeft: {
    position: "absolute",
    left: -80,
    top: height * 0.22,
    width: 220,
    height: 220,
    borderRadius: 220,
    backgroundColor: "#CFF3FF",
    opacity: 0.45,
  },
  blobRight: {
    position: "absolute",
    right: -90,
    top: height * 0.26,
    width: 260,
    height: 260,
    borderRadius: 260,
    backgroundColor: "#F6D5FF",
    opacity: 0.35,
  },

  headerBrandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginTop: 20,
    marginBottom: 10,
    marginHorizontal: 20,
    paddingHorizontal: 8,
  },
  headerCityLogo: {
    width: 64,
    height: 64,
    marginRight: 12,
  },
  headerSeal: {
    width: width * 0.48,
    height: 36,
    marginLeft: 4,
  },

  logo: {
    width: width * 0.42,
    height: 60,
    marginTop: 0,
    marginBottom: 8,
    alignSelf: "center",
  },

  slidesArea: { flex: 1 },

  slide: { alignItems: "center", paddingHorizontal: 22 },

  hero: {
    width: width * 0.92,
    height: height * 0.42,
    alignSelf: "center",
    marginTop: 6,
    marginBottom: 22,
  },

  title: {
    color: TEAL,
    fontSize: 24,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 10,
    lineHeight: 30,
  },
  desc: {
    color: TEAL,
    opacity: 0.95,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    paddingHorizontal: 14,
  },

  dotsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginBottom: 90, // leave room above the fixed button
  },
  dot: { width: 10, height: 10, borderRadius: 10, backgroundColor: "#D9D9D9" },
  dotActive: { width: 34, borderRadius: 999, backgroundColor: TEAL },

  bottomFixed: {
    position: "absolute",
    left: 22,
    right: 22,
    bottom: 18,
  },

  btnWrap: {
    height: 56,
    borderRadius: 12,
    backgroundColor: TEAL,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  btnText: { color: "#FFFFFF", fontSize: 18, fontWeight: "800" },
});
