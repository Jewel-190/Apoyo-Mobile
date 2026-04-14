import { supabase } from "./supabase";

export type RequestTableName =
  | "hospitalization_requests"
  | "treatment_requests"
  | "medical_requests"
  | "financial_requests"
  | "monetary_requests"
  | "burial_requests"
  | "cremation_requests"
  | "columbarium_requests";

export type RequestAttachmentStatus =
  | "in progress"
  | "approved"
  | "action_required"
  | "resubmitted";

export type RequestAttachmentRow = {
  uid: string;
  request_uid: string;
  request_table: RequestTableName;
  file_type: string;
  path: string;
  status: RequestAttachmentStatus;
  created: string;
  updated: string;
};

const FILE_TYPE_MAP: Record<RequestTableName, Record<string, string>> = {
  hospitalization_requests: {
    abstract: "abstract_file",
    bill: "bill_file",
    letter: "letter_file",
    voterId: "voter_id_file",
    birthCert: "birth_cert_file",
    barangay: "barangay_endorsement_file",
    indigency: "indigency_cert_file",
    attachment: "attachment_file",
  },
  treatment_requests: {
    medCert: "med_cert_file",
    rx: "rx_file",
    lab: "lab_file",
    letter: "letter_file",
    voterId: "voter_id_file",
    birthCert: "birth_cert_file",
    barangay: "barangay_endorsement_file",
    indigency: "indigency_cert_file",
    attachment: "attachment_file",
  },
  medical_requests: {
    medCert: "med_cert_file",
    prescription: "prescription_file",
    quotation: "quotation_file",
    letter: "letter_file",
    voterId: "voter_id_file",
    birthCert: "birth_cert_file",
    barangay: "barangay_endorsement_file",
    indigency: "indigency_cert_file",
    attachment: "attachment_file",
  },
  financial_requests: {
    letter: "letter_file",
    voterId: "voter_id_file",
    validId: "valid_id_file",
    barangay: "barangay_endorsement_file",
    indigency: "indigency_cert_file",
    attachment: "attachment_file",
  },
  monetary_requests: {
    letter: "letter_file",
    voterId: "voters_id_or_cert_file",
    birthCert: "valid_id_or_birth_cert_file",
    barangay: "barangay_endorsement_file",
    indigency: "indigency_cert_file",
    attachment: "additional_attachment_file",
  },
  burial_requests: {
    deathCert: "death_cert_file",
    validId: "valid_id_file",
    barangay: "barangay_endorsement_file",
    indigency: "indigency_cert_file",
    attachment: "attachment_file",
  },
  cremation_requests: {
    deathCert: "death_cert_file",
    validId: "valid_id_file",
    barangay: "barangay_endorsement_file",
    indigency: "indigency_cert_file",
    attachment: "attachment_file",
  },
  columbarium_requests: {
    deathCert: "death_cert_file",
    validId: "valid_id_file",
    cremationCert: "cremation_cert_file",
    barangay: "barangay_endorsement_file",
    indigency: "indigency_cert_file",
    attachment: "attachment_file",
  },
};

function toDbFileType(requestTable: RequestTableName, fileType: string): string {
  return FILE_TYPE_MAP[requestTable]?.[fileType] || fileType;
}

function fromDbFileType(requestTable: RequestTableName, fileType: string): string {
  const map = FILE_TYPE_MAP[requestTable] || {};
  const pair = Object.entries(map).find(([, dbType]) => dbType === fileType);
  return pair?.[0] || fileType;
}

export async function listRequestAttachments(
  requestTable: RequestTableName,
  requestUid: string
): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from("request_attachments")
    .select("file_type,path")
    .eq("request_table", requestTable)
    .eq("request_uid", requestUid);

  if (error) throw error;

  const paths: Record<string, string> = {};
  for (const row of (data || []) as Array<Pick<RequestAttachmentRow, "file_type" | "path">>) {
    if (row.path) {
      const uiFileType = fromDbFileType(requestTable, row.file_type);
      paths[uiFileType] = row.path;
    }
  }
  return paths;
}

export async function upsertRequestAttachment(params: {
  requestTable: RequestTableName;
  requestUid: string;
  fileType: string;
  path: string;
  status?: RequestAttachmentStatus;
}): Promise<void> {
  const { requestTable, requestUid, fileType, path, status = "in progress" } = params;
  const dbFileType = toDbFileType(requestTable, fileType);

  const { error } = await supabase.from("request_attachments").upsert(
    {
      request_table: requestTable,
      request_uid: requestUid,
      file_type: dbFileType,
      path,
      status,
    },
    {
      onConflict: "request_table,request_uid,file_type",
    }
  );

  if (error) throw error;
}

export async function deleteRequestAttachment(params: {
  requestTable: RequestTableName;
  requestUid: string;
  fileType: string;
}): Promise<void> {
  const { requestTable, requestUid, fileType } = params;
  const dbFileType = toDbFileType(requestTable, fileType);

  const { error } = await supabase
    .from("request_attachments")
    .delete()
    .eq("request_table", requestTable)
    .eq("request_uid", requestUid)
    .eq("file_type", dbFileType);

  if (error) throw error;
}

export function inferAttachmentName(filePath: string, fileType?: string): string {
  const baseName = filePath.split("/").pop() || "file";
  if (!fileType) return baseName;

  const prefix = `${fileType}_`;
  if (!baseName.startsWith(prefix)) return baseName;

  const trimmed = baseName.slice(prefix.length);
  return trimmed || baseName;
}
