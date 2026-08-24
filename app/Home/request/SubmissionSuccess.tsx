/**
 * Post-submit confirmation (`/Home/request/SubmissionSuccess`).
 * Resolves `serviceId` / `serviceKey` from route params.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  Redirect,
  useGlobalSearchParams,
  useLocalSearchParams,
  useRouter,
} from "expo-router";
import type { Category } from "@/AppCore/AppUiDomainTypes";
import {
  makeApplicationId,
  prettyDate,
  upsertSubmittedStatusApplication,
} from "@/AppCore/AssistanceStatusApplicationsCache";
import { markStatusApplicationsCacheDirty } from "@/AppCore/StatusApplicationsRepository";
import { useAssistanceCatalog } from "@/AppCore/UseAssistanceCatalog";
import { successHeadingForService } from "@/AppCore/CategoryCatalogUi";
import { getCatalogLookupRuntime } from "@/AppCore/CatalogLookupRuntime";
import { submissionSavedKey } from "@/AppCore/ClientStorageKeys";
import { ASSISTANCE_REQUESTS_TABLE } from "@/AppCore/AssistanceRequestSql";
import { supabase } from "@/AppCore/SupabaseClient";
import type { ServiceId } from "@/AppCore/AssistanceServiceDefinitions";
import {
  defaultSubmissionSuccessPath,
  normalizeRouteServiceId,
  pickServiceIdFromSearchParams,
  REQUEST_SUCCESS_PATH,
} from "@/AppCore/RequestPipelineRoutes";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";

const SUCCESS_FONT = Platform.select({ ios: "SF Pro Rounded", android: "System" })!;
const PIN_PNG = require("../../../assets/images/Pin.png");
const BOOK_PNG = require("../../../assets/images/Book.png");

const TEAL = "#0B8F8B";
const TEXT = "#000000";
const BLUE = "#1D7EDC";
const CARD_BORDER = "#E7E7E7";
const GREEN = "#7CCB53";
const BG = "#FFFFFF";

type SuccessBodyProps = {
  serviceId: ServiceId;
  serviceKey: string;
  categorySlug: string;
  heading: string;
  detailTitle: string;
  description: string;
  category: Category;
  applicationCodePrefix: string;
  dedupeKey?: string;
  requestId?: string | null;
  initialRequestCode?: string | null;
  requestTable?: string;
};

function SubmissionSuccessBody(props: SuccessBodyProps) {
  const router = useRouter();
  const requestId = (props.requestId ?? "").toString().trim();
  const requestTable = props.requestTable ?? "assistance_requests";

  const [requestCode, setRequestCode] = useState<string | null>(
    (props.initialRequestCode ?? "") || null
  );
  const [isCodeLoading, setIsCodeLoading] = useState(false);

  const createdAt = useMemo(() => Date.now(), []);
  const appId = useMemo(
    () => makeApplicationId(props.applicationCodePrefix),
    [props.applicationCodePrefix]
  );

  const dedupeKey = useMemo(
    () =>
      requestId
        ? submissionSavedKey(requestId)
        : submissionSavedKey(props.dedupeKey ?? props.applicationCodePrefix),
    [props.dedupeKey, props.applicationCodePrefix, requestId]
  );

  const savedOnce = useRef(false);

  useEffect(() => {
    if (requestCode || !requestId || !requestTable) return;
    let active = true;

    (async () => {
      try {
        setIsCodeLoading(true);
        const { data, error } = await supabase
          .from(requestTable as never)
          .select("request_code")
          .eq("id" as never, requestId as never)
          .maybeSingle();
        if (error) throw error;

        const row = data as { request_code?: string | null } | null;
        const code =
          typeof row?.request_code === "string" ? row.request_code.trim() : "";

        if (active && code) setRequestCode(code);
      } catch (err) {
        console.log("Fetch request code failed:", err);
      } finally {
        if (active) setIsCodeLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [requestCode, requestId, requestTable]);

  useEffect(() => {
    (async () => {
      try {
        if (savedOnce.current) return;
        if (!requestId) return;
        const already = await AsyncStorage.getItem(dedupeKey);
        if (already === requestId) return;

        savedOnce.current = true;

        await upsertSubmittedStatusApplication(
          {
            id: requestId,
            title: props.detailTitle,
            description: props.description,
            status: "Pending",
            category: props.category,
            categorySlug: props.categorySlug,
            service: props.serviceId,
            createdAt,
            applicationId: appId,
            dateLabel: prettyDate(createdAt),
            requestCode: requestCode ?? undefined,
          },
          requestId
        );

        markStatusApplicationsCacheDirty();
        await AsyncStorage.setItem(dedupeKey, requestId);
      } catch (err) {
        console.log("Save to Status failed:", err);
      }
    })();
  }, [
    appId,
    createdAt,
    dedupeKey,
    props.category,
    props.categorySlug,
    props.description,
    props.detailTitle,
    props.serviceId,
    requestCode,
    requestId,
  ]);

  return (
    <SafeAreaView style={successUiStyles.safe}>
      <StatusBar barStyle="dark-content" />

      <View style={successUiStyles.screen}>
        <Image source={BOOK_PNG} style={successUiStyles.illus} />

        <Text style={successUiStyles.title}>Application Received!</Text>

        <Text style={successUiStyles.desc}>
          Thank you for submitting your requirements.{"\n"}
          We have received your request for{"\n"}
          {props.heading} -{" "}
          <Text style={successUiStyles.linkish}>{props.detailTitle}</Text>.
        </Text>

        {requestCode ? (
          <Text style={successUiStyles.appId}>Request Code: {requestCode}</Text>
        ) : isCodeLoading ? (
          <View style={successUiStyles.loadingCodeRow}>
            <ActivityIndicator size="small" color={TEAL} />
            <Text style={successUiStyles.loadingCodeText}>Loading request code...</Text>
          </View>
        ) : null}

        <View style={successUiStyles.card}>
          <View style={successUiStyles.cardHeader} />
          <Image source={PIN_PNG} style={successUiStyles.pin} />

          <Text style={successUiStyles.cardTitle}>What&apos;s Next?</Text>

          <View style={successUiStyles.bullets}>
            <View style={successUiStyles.bulletRow}>
              <Text style={successUiStyles.dot}>•</Text>
              <Text style={successUiStyles.bulletText}>
                Our officers will verify your uploaded requirements.
              </Text>
            </View>
            <View style={successUiStyles.bulletRow}>
              <Text style={successUiStyles.dot}>•</Text>
              <Text style={successUiStyles.bulletText}>
                You will receive an SMS and Email alert as soon as your status
                changes.
              </Text>
            </View>
            <View style={successUiStyles.bulletRow}>
              <Text style={successUiStyles.dot}>•</Text>
              <Text style={successUiStyles.bulletText}>
                You can monitor progress anytime in the{" "}
                <Text style={successUiStyles.statusLink}>&quot;Status&quot;</Text> tab.
              </Text>
            </View>
          </View>
        </View>

        <View style={successUiStyles.bottom}>
          <Pressable
            onPress={() => router.replace("/Status/Status")}
            style={({ pressed }) => [successUiStyles.btn, pressed && { opacity: 0.92 }]}
          >
            <Text style={successUiStyles.btnText}>Continue</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const successUiStyles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  screen: { flex: 1, alignItems: "center", paddingTop: 56, paddingHorizontal: 22 },
  illus: { width: 110, height: 110, resizeMode: "contain", marginBottom: 14 },
  title: {
    fontFamily: SUCCESS_FONT,
    fontSize: 18,
    fontWeight: "700",
    color: TEXT,
    marginBottom: 10,
    textAlign: "center",
  },
  desc: {
    fontFamily: SUCCESS_FONT,
    fontSize: 14,
    lineHeight: 18,
    color: TEXT,
    textAlign: "center",
    marginBottom: 10,
  },
  linkish: { color: BLUE, fontFamily: SUCCESS_FONT, fontWeight: "400" },
  appId: { marginTop: 10, fontFamily: SUCCESS_FONT, fontSize: 14, color: TEXT },
  loadingCodeRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  loadingCodeText: { fontFamily: SUCCESS_FONT, fontSize: 14, color: TEXT },
  card: {
    width: "100%",
    marginTop: 20,
    borderRadius: 14,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: CARD_BORDER,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
    elevation: 3,
  },
  cardHeader: { height: 36, backgroundColor: GREEN },
  pin: {
    position: "absolute",
    right: 16,
    top: 8,
    width: 48,
    height: 48,
    resizeMode: "contain",
  },
  cardTitle: {
    marginTop: 16,
    marginLeft: 16,
    fontFamily: SUCCESS_FONT,
    fontSize: 14,
    fontWeight: "400",
    color: TEXT,
  },
  bullets: { paddingHorizontal: 16, marginTop: 12, paddingBottom: 20, gap: 12 },
  bulletRow: { flexDirection: "row", gap: 8 },
  dot: {
    width: 12,
    fontFamily: SUCCESS_FONT,
    fontSize: 14,
    lineHeight: 20,
    color: TEXT,
    marginTop: 1,
  },
  bulletText: {
    flex: 1,
    fontFamily: SUCCESS_FONT,
    fontSize: 14,
    lineHeight: 20,
    color: TEXT,
  },
  statusLink: { color: BLUE, fontFamily: SUCCESS_FONT, fontWeight: "400" },
  bottom: { position: "absolute", left: 22, right: 22, bottom: 20 },
  btn: {
    height: 52,
    borderRadius: 26,
    backgroundColor: TEAL,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  btnText: { fontFamily: SUCCESS_FONT, fontSize: 14, fontWeight: "400", color: "#fff" },
});

export type SubmissionSuccessPageProps = {
  forcedServiceKey?: string;
};

export default function SubmissionSuccess({
  forcedServiceKey,
}: SubmissionSuccessPageProps = {}) {
  const { loading: catalogLoading, error: catalogError, reload } =
    useAssistanceCatalog();
  const params = useLocalSearchParams();
  const globalParams = useGlobalSearchParams();

  const rawKey = useMemo(() => {
    const f = forcedServiceKey?.trim();
    if (f) return f.toLowerCase();
    const fromParams = pickServiceIdFromSearchParams(
      params as Record<string, string | string[] | undefined>,
      globalParams as Record<string, string | string[] | undefined>
    );
    return fromParams;
  }, [forcedServiceKey, params, globalParams]);

  const serviceUuid = normalizeRouteServiceId(rawKey);

  const catalog = getCatalogLookupRuntime();
  const rt =
    serviceUuid != null ? catalog?.byServiceId[serviceUuid] ?? null : null;

  const rest = { ...params };
  delete (rest as { serviceKey?: unknown }).serviceKey;

  if (!serviceUuid) {
    const path = defaultSubmissionSuccessPath();
    if (path === "/Home/Home") {
      return <Redirect href="/Home/Home" />;
    }
    const first = catalog?.sortedServiceIds?.[0];
    const sid =
      pickServiceIdFromSearchParams(
        rest as Record<string, string | string[] | undefined>,
        globalParams as Record<string, string | string[] | undefined>
      ) || first;
    if (!sid) {
      return <Redirect href="/Home/Home" />;
    }
    return (
      <Redirect
        href={
          {
            pathname: REQUEST_SUCCESS_PATH,
            params: { ...rest, serviceId: sid },
          } as never
        }
      />
    );
  }

  if (catalog && !rt) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackText}>
          Unknown assistance type. Please return Home and open Status from there.
        </Text>
      </View>
    );
  }

  if (!rt) {
    if (catalogLoading) {
      return (
        <View style={styles.fallback}>
          <ActivityIndicator color="#0B8F8B" />
          <Text style={styles.fallbackText}>Loading assistance catalog…</Text>
        </View>
      );
    }

    if (catalogError || !catalog) {
      return (
        <View style={styles.fallback}>
          <Text style={styles.fallbackText}>
            We couldn&apos;t load the assistance catalog. Check your connection
            and try again.
          </Text>
          <Pressable onPress={() => void reload()} style={styles.retryBtn}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <View style={styles.fallback}>
        <ActivityIndicator color="#0B8F8B" />
        <Text style={styles.fallbackText}>Loading assistance catalog…</Text>
      </View>
    );
  }

  return (
    <SubmissionSuccessBody
      serviceId={serviceUuid}
      serviceKey={rt.routeToken}
      categorySlug={rt.categorySlug}
      heading={successHeadingForService(rt)}
      detailTitle={rt.displayName}
      description=""
      category={rt.categorySlug.trim().toLowerCase()}
      applicationCodePrefix={rt.applicationCodePrefix}
      dedupeKey={rt.successDedupeSuffix}
      requestId={(params.requestId as string | undefined) ?? null}
      initialRequestCode={(params.requestCode as string | undefined) ?? null}
      requestTable={ASSISTANCE_REQUESTS_TABLE}
    />
  );
}

const styles = StyleSheet.create({
  fallback: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    gap: 12,
    backgroundColor: "#fff",
  },
  fallbackText: {
    fontSize: 14,
    color: "#2B2B2B",
    textAlign: "center",
  },
  retryBtn: {
    backgroundColor: "#0B8F8B",
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
  },
  retryText: { fontSize: 14, color: "#fff", fontWeight: "600" },
});
