// app/Home/Applications.ts
import AsyncStorage from "@react-native-async-storage/async-storage";

export type Category = "medical" | "financial" | "burial";
export type ServiceStatus =
  | "Pending"
  | "In Progress"
  | "Action Required"
  | "Approved";

export type ApplicationItem = {
  id: string;
  title: string;
  description: string;
  status: ServiceStatus;
  category: Category;
  createdAt?: number;

  // for StatusDetails header
  applicationId?: string; // e.g. MAHE-2026-001
  dateLabel?: string; // e.g. Feb 8, 2026
};

const STORAGE_KEY_STATUS_LIST = "apoyo_status_applications_v1";

export async function getStatusApplications(): Promise<ApplicationItem[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_STATUS_LIST);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const cleaned: ApplicationItem[] = parsed
      .map((x: any) => ({
        id: String(x?.id ?? `APP-${Date.now()}`),
        title: String(x?.title ?? ""),
        description: String(x?.description ?? ""),
        status: (x?.status as ServiceStatus) ?? "Pending",
        category: (x?.category as Category) ?? "medical",
        createdAt: typeof x?.createdAt === "number" ? x.createdAt : Date.now(),
        applicationId: x?.applicationId ? String(x.applicationId) : undefined,
        dateLabel: x?.dateLabel ? String(x.dateLabel) : undefined,
      }))
      .filter((x) => x.title.trim().length > 0);

    return cleaned;
  } catch {
    return [];
  }
}

export async function addStatusApplication(app: ApplicationItem) {
  const list = await getStatusApplications();
  const exists = list.some((x) => x.id === app.id);
  const next = exists ? list : [app, ...list];
  await AsyncStorage.setItem(STORAGE_KEY_STATUS_LIST, JSON.stringify(next));
}

export async function getStatusApplicationById(id: string) {
  const list = await getStatusApplications();
  return list.find((x) => x.id === id) ?? null;
}

export function makeStatusId(prefix = "APP") {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;
}

export function makeApplicationId(prefix: string) {
  const year = new Date().getFullYear();
  const seq = Math.floor(Math.random() * 900 + 100);
  return `${prefix}-${year}-${seq}`;
}

export function prettyDate(ts?: number) {
  const d = new Date(typeof ts === "number" ? ts : Date.now());
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
