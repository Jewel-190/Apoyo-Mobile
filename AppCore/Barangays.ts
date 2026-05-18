import { supabase } from "./SupabaseClient";

export type BarangayOption = {
  id: string;
  name: string;
};

/** Active barangays from `public.barangays` (id + name), ordered by name. */
export async function fetchBarangays(): Promise<BarangayOption[]> {
  const { data, error } = await supabase
    .from("barangays")
    .select("id, name")
    .order("name", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name ?? "",
  }));
}
