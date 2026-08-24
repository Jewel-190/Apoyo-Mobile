import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { Image as ExpoImage } from "expo-image";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { NAV_TOTAL_HEIGHT } from "../../components/BottomNavBar";
import type { HomeDetailsPage } from "@/AppCore/AssistanceCatalogFromApi";
import { categoryCardTrimGradient } from "@/AppCore/ServiceCatalogDisplay";
import { resolveServiceId } from "@/AppCore/CatalogLookupRuntime";
import { supabase } from "@/AppCore/SupabaseClient";
import { useSingleFlight } from "@/AppCore/UseInteractionGuard";
import { CmsRichText, hasVisibleCmsContent } from "@/AppCore/CmsRichText";
import { useAssistanceCatalog } from "@/AppCore/UseAssistanceCatalog";

const { width } = Dimensions.get("window");

const TEAL = "#0B8F8B";
const PANEL_BG = "#F5F6F6";
const TEXT_DARK = "#2B2B2B";
const TEXT_MUTED = "#7B7B7B";

const GRAD = {
  chip: ["#7BE05B", "#63C44A"] as [string, string],
};

// Brand default for the "All Services" filter chip.
const DEFAULT_CHIP_GRADIENT: [string, string] = [TEAL, "#077E7B"];

const FONT = "SF Pro Rounded";

const CACHE_USER = "apoyo_user_cache";
const USER_PROFILE_TTL_MS = 5 * 60 * 1000;
let lastUserProfileFetchAtMs = 0;

const ROUTE_REQUEST = "/Home/request/RequestInfo";

const PROFILE_PNG = require("../../assets/images/ProfileIcon.png");
const DASMA_CITY_LOGO = require("../../assets/images/Dasmariñas Logo.png");
const APOYO_MARK = require("../../assets/images/apoyologo.png");

type Service = {
  id: string;
  title: string;
  desc: string;
  descHtml: string;
  descriptionFontFamily: string;
  cardStripeGradient: [string, string];
  iconUrl: string | null;
  categorySlug: string;
  categoryLabel: string;
};

function stripHtmlForSearch(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function serviceMatchesSearch(service: Service, rawQuery: string): boolean {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;

  const haystack = [
    service.title,
    service.categoryLabel,
    service.desc,
    stripHtmlForSearch(service.descHtml),
  ]
    .join(" ")
    .toLowerCase();

  const tokens = query.split(/\s+/).filter(Boolean);
  return tokens.every((token) => haystack.includes(token));
}

export default function Assistance() {
  const router = useRouter();

  const [chip, setChip] = useState<"all" | string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  // Draft dialog state
  const [showDraftDialog, setShowDraftDialog] = useState(false);
  const [pendingServiceId, setPendingServiceId] = useState<string | null>(null);
  const [pendingDraftId, setPendingDraftId] = useState<string | null>(null);

  const { bundle, loading: catalogLoading, reload: reloadCatalog } =
    useAssistanceCatalog();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { inFlight: serviceActionBusy, run: runServiceAction } = useSingleFlight();
  const { inFlight: catalogRetryBusy, run: runCatalogRetry } = useSingleFlight();

  const interactionsLocked =
    serviceActionBusy || catalogRetryBusy || catalogLoading;

  const trimmedSearchQuery = searchQuery.trim();
  const isSearchActive = trimmedSearchQuery.length > 0;

  const services: Service[] = useMemo(() => {
    if (!bundle?.services?.length) return [];
    return bundle.services.map((s) => ({
      id: s.id,
      title: s.title,
      desc: s.desc,
      descHtml: s.descHtml,
      descriptionFontFamily: s.descriptionFontFamily,
      cardStripeGradient: categoryCardTrimGradient(s.categorySlug),
      iconUrl: s.iconUrl,
      categorySlug: s.categorySlug,
      categoryLabel: s.categoryLabel,
    }));
  }, [bundle]);

  const categoryChips = useMemo(() => {
    const fromBundle = bundle?.categoryFilters ?? [];
    if (fromBundle.length) return fromBundle;
    const m = new Map<string, string>();
    for (const s of services) {
      if (!m.has(s.categorySlug)) m.set(s.categorySlug, s.categoryLabel);
    }
    return [...m.entries()].map(([slug, label]) => ({
      slug,
      label,
      sort_order: 0,
    }));
  }, [bundle?.categoryFilters, services]);

  const filtered = useMemo(() => {
    const byCategory =
      chip === "all" ? services : services.filter((s) => s.categorySlug === chip);
    if (!trimmedSearchQuery) return byCategory;
    return byCategory.filter((s) => serviceMatchesSearch(s, trimmedSearchQuery));
  }, [chip, services, trimmedSearchQuery]);

  const detailsMap: Record<string, HomeDetailsPage> = useMemo(
    () => bundle?.detailsByServiceId ?? {},
    [bundle]
  );

  const refreshUserProfile = useCallback(async (force = false) => {
    const cached = await AsyncStorage.getItem(CACHE_USER);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed.first_name) setDisplayName(parsed.first_name);
        if (parsed.avatar_url) {
          setAvatarUrl(parsed.avatar_url);
          ExpoImage.prefetch(parsed.avatar_url);
        }
      } catch {
        /* ignore corrupt cache */
      }
    }

    if (!force && Date.now() - lastUserProfileFetchAtMs < USER_PROFILE_TTL_MS) {
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("users")
      .select(
        "first_name, middle_name, last_name, contact_number, email, avatar_url"
      )
      .eq("id", user.id)
      .single();

    if (!data) return;

    lastUserProfileFetchAtMs = Date.now();

    if (data.first_name) setDisplayName(data.first_name);
    if (data.avatar_url) {
      setAvatarUrl(data.avatar_url);
      ExpoImage.prefetch(data.avatar_url);
    } else {
      setAvatarUrl(null);
    }

    const cachedRaw = await AsyncStorage.getItem(CACHE_USER);
    const previous = cachedRaw ? JSON.parse(cachedRaw) : {};
    await AsyncStorage.setItem(
      CACHE_USER,
      JSON.stringify({ ...previous, ...data, id: user.id })
    );
  }, []);

  useEffect(() => {
    void refreshUserProfile();
  }, [refreshUserProfile]);

  const onPullRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([reloadCatalog(), refreshUserProfile(true)]);
    } finally {
      setIsRefreshing(false);
    }
  }, [reloadCatalog, refreshUserProfile]);

  // Check if user has an existing draft for a service type
  const checkForDraft = async (serviceId: string): Promise<string | null> => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user?.id) return null;

      const sid = resolveServiceId(serviceId) ?? serviceId;

      const { data, error } = await supabase
        .from("assistance_requests")
        .select("id, status, submitted_at, created_at")
        .eq("user_id", userData.user.id)
        .eq("service_id", sid)
        .order("created_at", { ascending: false })
        .limit(10);

      if (error || !data || data.length === 0) return null;

      const draftLike = data.find((row: any) => {
        const raw = (row?.status ?? "").toString().trim().toLowerCase();
        const isDraftStatus = raw === "draft";
        const isUnsubmitted = !row?.submitted_at;
        return isDraftStatus || isUnsubmitted;
      });

      return draftLike?.id?.toString() || null;
    } catch {
      return null;
    }
  };

  const guardedOpenService = (serviceId: string) => {
    void runServiceAction(async () => {
      const draftId = await checkForDraft(serviceId);
      if (draftId) {
        setPendingServiceId(serviceId);
        setPendingDraftId(draftId);
        setShowDraftDialog(true);
        return;
      }

      const sid = resolveServiceId(serviceId) ?? serviceId;
      pushRequestInfoStart(sid);
    });
  };

  const pushRequestInfoStart = (
    serviceId: string,
    opts?: { forceNewDraft?: boolean }
  ) => {
    const sid = resolveServiceId(serviceId) ?? serviceId;
    const svc = services.find((s) => s.id === sid);
    const category = (
      detailsMap[sid]?.categorySlug ??
      svc?.categorySlug ??
      ""
    )
      .trim()
      .toLowerCase();
    const serviceTitle =
      svc?.title ?? detailsMap[sid]?.serviceTitle ?? "";

    router.push({
      pathname: ROUTE_REQUEST,
      params: {
        serviceId: sid,
        serviceTitle,
        category,
        ...(opts?.forceNewDraft ? { forceNewDraft: "1" } : {}),
      },
    } as any);
  };

  const handleDraftDialogContinue = () => {
    // User doesn't want to make another request - just close dialog
    setShowDraftDialog(false);
    setPendingServiceId(null);
    setPendingDraftId(null);
  };

  const handleDraftDialogNew = () => {
    void runServiceAction(async () => {
      setShowDraftDialog(false);
      const sid = pendingServiceId;
      if (sid) {
        const resolved = resolveServiceId(sid) ?? sid;
        pushRequestInfoStart(resolved, { forceNewDraft: true });
      }
      setPendingServiceId(null);
      setPendingDraftId(null);
    });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />

      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <View style={styles.headerBrandRow}>
            <Image
              source={DASMA_CITY_LOGO}
              style={styles.headerCityLogo}
              resizeMode="contain"
            />
            <Image
              source={APOYO_MARK}
              style={styles.headerApoyoLogo}
              resizeMode="contain"
            />
          </View>
          <View style={styles.searchPill}>
            <Ionicons name="search" size={18} color="#9AA6A6" style={styles.searchIcon} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search services"
              placeholderTextColor="#9AA6A6"
              style={styles.searchInput}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
              clearButtonMode="while-editing"
            />
            {isSearchActive && Platform.OS === "android" ? (
              <Pressable
                onPress={() => setSearchQuery("")}
                hitSlop={8}
                style={styles.searchClearBtn}
                accessibilityLabel="Clear search"
              >
                <Ionicons name="close-circle" size={18} color="#9AA6A6" />
              </Pressable>
            ) : null}
          </View>
        </View>

        <View style={styles.greetRow}>
          <View style={styles.profileCircle}>
            {avatarUrl ? (
              <ExpoImage
                source={{ uri: avatarUrl }}
                style={styles.profileFullImg}
                contentFit="cover"
                cachePolicy="memory-disk"
                recyclingKey={avatarUrl}
              />
            ) : (
              <Image
                source={PROFILE_PNG}
                style={styles.profileImg}
                resizeMode="contain"
              />
            )}
          </View>
          <View style={styles.greetTextWrap}>
            <Text style={styles.hiText}>
              Hi, <Text style={styles.hiName}>{displayName}</Text>
            </Text>
            <Text style={styles.hiSubText}>Explore available city assistance</Text>
          </View>
        </View>
      </View>

      <View style={styles.panel}>
        <View style={styles.servicesHeaderBlock}>
          <View style={styles.servicesHeader}>
            <Text style={styles.servicesHeaderTitle}>Popular Services</Text>
            <Text style={styles.servicesHeaderSubtitle}>
              Avail city benefits and services in just a few taps.
            </Text>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipsScroll}
            contentContainerStyle={styles.chipsRow}
          >
            <View style={styles.chipItem}>
              <ChipGradient
                label="All Services"
                active={chip === "all"}
              activeGradient={DEFAULT_CHIP_GRADIENT}
                onPress={() => setChip("all")}
              />
            </View>
            {categoryChips.map((c) => (
              <View key={c.slug} style={styles.chipItem}>
                <ChipGradient
                  label={c.label}
                  active={chip === c.slug}
                  activeGradient={
                    bundle?.runtime?.categoryThemeBySlug[c.slug]
                      ?.homeChipActiveGradient ?? GRAD.chip
                  }
                  onPress={() => setChip(c.slug)}
                />
              </View>
            ))}
          </ScrollView>
        </View>

        <ScrollView
          contentContainerStyle={styles.gridScrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => void onPullRefresh()}
              tintColor={TEAL}
              colors={[TEAL]}
              progressBackgroundColor="#FFFFFF"
            />
          }
        >
          <View style={styles.grid}>
            {catalogLoading && services.length === 0 ? (
              <View style={styles.catalogLoadingWrap}>
                <ActivityIndicator size="large" color={TEAL} />
              </View>
            ) : null}
            {!catalogLoading && services.length === 0 ? (
              <View style={styles.catalogLoadingWrap}>
                <Text style={styles.catalogErrorText}>
                  Assistance services could not be loaded. Pull down to refresh
                  or check your connection.
                </Text>
                <Pressable
                  onPress={() => {
                    void runCatalogRetry(async () => {
                      await reloadCatalog();
                    });
                  }}
                  disabled={interactionsLocked}
                  style={({ pressed }) => [
                    styles.catalogRetryBtn,
                    pressed && !interactionsLocked && { opacity: 0.85 },
                    interactionsLocked && { opacity: 0.6 },
                  ]}
                >
                  <Text style={styles.catalogRetryText}>Retry</Text>
                </Pressable>
              </View>
            ) : null}
            {!catalogLoading && services.length > 0 && filtered.length === 0 ? (
              <View style={styles.searchEmptyWrap}>
                <Ionicons name="search-outline" size={40} color="#B8C4C4" />
                <Text style={styles.searchEmptyTitle}>No matching services</Text>
                <Text style={styles.searchEmptyText}>
                  {isSearchActive
                    ? `Nothing found for "${trimmedSearchQuery}"${
                        chip !== "all"
                          ? ` in ${
                              categoryChips.find((c) => c.slug === chip)?.label ??
                              "this category"
                            }`
                          : ""
                      }. Try another keyword or category.`
                    : "Try another category filter."}
                </Text>
                {isSearchActive ? (
                  <Pressable
                    onPress={() => setSearchQuery("")}
                    style={({ pressed }) => [
                      styles.searchEmptyClearBtn,
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <Text style={styles.searchEmptyClearText}>Clear search</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
            {filtered.map((s) => (
              <Pressable
                key={s.id}
                style={styles.cardWrap}
                onPress={() => guardedOpenService(s.id)}
                disabled={interactionsLocked}
              >
                {({ pressed }) => (
                  <View
                    style={[
                      styles.card,
                      pressed && !interactionsLocked && styles.cardPressed,
                      interactionsLocked && styles.cardDisabled,
                    ]}
                  >
                    <LinearGradient
                      colors={s.cardStripeGradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.cardTopLine}
                    />
                    <View style={styles.cardInner}>
                      <View style={styles.cardIconRow}>
                        {s.iconUrl ? (
                          <ExpoImage
                            source={{ uri: s.iconUrl }}
                            style={styles.servicePng}
                            contentFit="contain"
                          />
                        ) : (
                          <Ionicons
                            name="layers-outline"
                            size={36}
                            color="#9AA6A6"
                          />
                        )}
                      </View>
                      <Text style={styles.cardTitle} numberOfLines={2}>
                        {s.title}
                      </Text>
                      <View style={styles.cardDescSlot}>
                        {hasVisibleCmsContent(s.descHtml) ? (
                          <CmsRichText
                            html={s.descHtml}
                            fontFamily={s.descriptionFontFamily}
                            baseStyle={styles.cardDesc}
                            textAlign="left"
                            contentWidth={CARD_DESC_WIDTH}
                          />
                        ) : s.desc ? (
                          <Text style={styles.cardDesc} numberOfLines={3}>
                            {s.desc}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  </View>
                )}
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Draft Confirmation Dialog */}
      <Modal
        visible={showDraftDialog}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDraftDialog(false)}
      >
        <View style={styles.draftOverlay}>
          <View style={styles.draftDialog}>
            <Text style={styles.draftTitle}>Existing Draft Found</Text>
            <Text style={styles.draftMessage}>
              You already have a draft for this service. Would you like to make another request?
            </Text>
            <Text style={styles.draftNote}>Your draft is in the Status tab</Text>
            <View style={styles.draftButtons}>
              <Pressable
                style={[styles.draftBtn, styles.draftBtnSecondary]}
                onPress={handleDraftDialogContinue}
                disabled={serviceActionBusy}
              >
                <Text style={styles.draftBtnSecondaryText}>No</Text>
              </Pressable>
              <Pressable
                style={[styles.draftBtn, styles.draftBtnPrimary]}
                onPress={handleDraftDialogNew}
                disabled={serviceActionBusy}
              >
                <Text style={styles.draftBtnPrimaryText}>Yes</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function ChipGradient({
  label,
  active,
  activeGradient = GRAD.chip,
  onPress,
}: {
  label: string;
  active: boolean;
  activeGradient?: [string, string];
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.chipShadow}>
      {({ pressed }) =>
        active ? (
          <LinearGradient
            colors={activeGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[
              styles.chipBase,
              styles.chipBaseActive,
              pressed && { opacity: 0.92 },
            ]}
          >
            <Text
              numberOfLines={1}
              style={[styles.chipText, { color: "#FFFFFF" }]}
            >
              {label}
            </Text>
          </LinearGradient>
        ) : (
          <View style={[styles.chipBase, { backgroundColor: "#FFFFFF" }]}>
            <Text
              numberOfLines={1}
              style={[styles.chipText, { color: "#5D6B6B" }]}
            >
              {label}
            </Text>
          </View>
        )
      }
    </Pressable>
  );
}

const CARD_GAP = 10;
const CARD_DESC_WIDTH = (width - 40) / 2 - 28;
const CARD_HEIGHT = 192;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: TEAL },
  header: {
    backgroundColor: TEAL,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "android" ? 10 : 0,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerBrandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 1,
    flexShrink: 0,
  },
  headerCityLogo: {
    width: 42,
    height: 42,
  },
  headerApoyoLogo: {
    width: 38,
    height: 38,
  },
  searchPill: {
    flex: 1,
    height: 40,
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  searchIcon: {
    marginLeft: 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: "#2F3B3B",
    paddingVertical: 0,
    fontFamily: FONT,
    fontWeight: "600",
  },
  searchClearBtn: {
    padding: 2,
  },
  searchEmptyWrap: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 48,
    gap: 10,
  },
  searchEmptyTitle: {
    marginTop: 4,
    fontSize: 17,
    color: TEXT_DARK,
    fontFamily: FONT,
    fontWeight: "700",
    textAlign: "center",
  },
  searchEmptyText: {
    fontSize: 14,
    lineHeight: 20,
    color: TEXT_MUTED,
    fontFamily: FONT,
    fontWeight: "500",
    textAlign: "center",
  },
  searchEmptyClearBtn: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TEAL,
  },
  searchEmptyClearText: {
    color: TEAL,
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 14,
  },
  greetRow: {
    paddingVertical: 12.5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 10,
  },
  greetTextWrap: {
    flexShrink: 1,
    alignItems: "flex-start",
  },
  profileCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.25)",
  },
  profileImg: { width: 36, height: 36 },
  profileFullImg: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  hiText: {
    color: "#EAFBFB",
    fontSize: 16,
    fontFamily: FONT,
    fontWeight: "600",
    textAlign: "left",
  },
  hiName: { fontFamily: FONT, fontWeight: "700" },
  hiSubText: {
    marginTop: 2,
    color: "#D4F3F2",
    fontSize: 14,
    fontFamily: FONT,
    fontWeight: "600",
    textAlign: "left",
  },
  panel: {
    flex: 1,
    backgroundColor: PANEL_BG,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: "hidden",
    paddingTop: 15,
  },
  gridScrollContent: {
    paddingTop: 7.5,
    paddingBottom: NAV_TOTAL_HEIGHT + 26,
    paddingHorizontal: 15,
  },
  title: {
    fontSize: 22,
    fontFamily: FONT,
    fontWeight: "700",
    color: TEXT_DARK,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    fontFamily: FONT,
    fontWeight: "600",
    color: TEXT_MUTED,
  },
  servicesHeaderBlock: {
    paddingBottom: 5,
    borderBottomWidth: 1,
    borderBottomColor: "#E6EAEC",
  },
  servicesHeader: {
    paddingHorizontal: 16,
    paddingBottom: 2,
  },
  servicesHeaderTitle: {
    fontSize: 22,
    fontFamily: FONT,
    fontWeight: "700",
    color: TEXT_DARK,
  },
  servicesHeaderSubtitle: {
    marginTop: 4,
    fontSize: 14,
    fontFamily: FONT,
    fontWeight: "600",
    color: TEXT_MUTED,
  },
  chipsRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingRight: 22,
    paddingVertical: 3,
  },
  chipsScroll: {
    marginTop: 6,
    marginBottom: 6,
  },
  chipItem: {
    marginRight: 10,
    flexShrink: 0,
  },

  chipShadow: {
    borderRadius: 20,
    alignSelf: "flex-start",
    flexShrink: 0,
    flexGrow: 0,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  
  chipBase: {
    height: 40,
    paddingHorizontal: 18,
    minWidth: 70,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
    flexShrink: 0,
    flexGrow: 0,
    flexDirection: "row",
  },
  chipBaseActive: {
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },

  chipText: {
    fontSize: 14,
    fontFamily: FONT,
    fontWeight: "700",
    textAlign: "center",
    flexShrink: 0,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -CARD_GAP / 2,
  },
  catalogLoadingWrap: {
    width: "100%",
    paddingVertical: 48,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  catalogErrorText: {
    fontFamily: FONT,
    fontWeight: "600",
    fontSize: 14,
    color: TEXT_MUTED,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 14,
  },
  catalogRetryBtn: {
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: TEAL,
  },
  catalogRetryText: {
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 14,
    color: "#FFFFFF",
  },
  cardWrap: {
    width: "50%",
    paddingHorizontal: CARD_GAP / 2,
    marginBottom: 14,
  },
  card: {
    height: CARD_HEIGHT,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  cardPressed: { transform: [{ scale: 0.985 }], opacity: 0.96 },
  cardDisabled: { opacity: 0.72 },
  cardTopLine: { height: 4, width: "100%" },
  cardInner: { flex: 1, padding: 14 },
  cardIconRow: { height: 38, justifyContent: "center", marginBottom: 12 },
  servicePng: { width: 34, height: 34 },
  cardTitle: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONT,
    fontWeight: "700",
    color: TEXT_DARK,
    marginTop: 2,
  },
  cardDescSlot: {
    marginTop: 2,
    flex: 1,
    overflow: "hidden",
  },
  cardDesc: {
    fontSize: 14,
    fontFamily: FONT,
    fontWeight: "600",
    color: TEXT_MUTED,
    lineHeight: 20,
  },
  // Draft dialog styles
  draftOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  draftDialog: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 24,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  draftTitle: {
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 18,
    color: TEXT_DARK,
    textAlign: "center",
    marginBottom: 12,
  },
  draftMessage: {
    fontFamily: FONT,
    fontWeight: "400",
    fontSize: 14,
    color: TEXT_MUTED,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 8,
  },
  draftNote: {
    fontFamily: FONT,
    fontWeight: "600",
    fontSize: 14,
    color: TEAL,
    textAlign: "center",
    marginBottom: 20,
  },
  draftButtons: {
    flexDirection: "row",
    gap: 12,
  },
  draftBtn: {
    flex: 1,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
  },
  draftBtnPrimary: {
    backgroundColor: TEAL,
  },
  draftBtnPrimaryText: {
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 14,
    color: "#FFFFFF",
  },
  draftBtnSecondary: {
    backgroundColor: "#F0F0F0",
  },
  draftBtnSecondaryText: {
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 14,
    color: TEXT_DARK,
  },
});
