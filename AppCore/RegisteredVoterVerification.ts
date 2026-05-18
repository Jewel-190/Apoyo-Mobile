import { supabase } from "./SupabaseClient";

/** Single user-facing message for any registry cross-match failure (avoids field-level leaks). */
export const REGISTRATION_VOTER_REGISTRY_MISMATCH_MESSAGE =
  "We could not find your information in the Dasmariñas City registered voter list. Please review your details and try again, or visit your barangay office if you believe this is an error.";

export type VerifyRegisteredVoterInput = {
  firstName: string;
  middleName: string;
  lastName: string;
  suffix: string;
  birthDate: string;
  sex: "M" | "F";
  barangayId: string;
  /** Must match `registered_voters.voter_id`. */
  voterIdNumber: string;
};

export type VerifyRegisteredVoterResult = {
  matched: boolean;
  registeredVoterId?: string;
  message?: string;
};

function isRegistryFieldValidationMessage(message: string): boolean {
  return (
    message.startsWith("Please enter") ||
    message.startsWith("Please select") ||
    message === "Birth date cannot be in the future."
  );
}

function parseVerifyPayload(data: unknown): VerifyRegisteredVoterResult {
  if (!data || typeof data !== "object") {
    return {
      matched: false,
      message: REGISTRATION_VOTER_REGISTRY_MISMATCH_MESSAGE,
    };
  }
  const row = data as { matched?: boolean; message?: string; registered_voter_id?: string };
  if (row.matched === true) {
    const registeredVoterId =
      typeof row.registered_voter_id === "string" ? row.registered_voter_id.trim() : "";
    if (!registeredVoterId) {
      return {
        matched: false,
        message: REGISTRATION_VOTER_REGISTRY_MISMATCH_MESSAGE,
      };
    }
    return { matched: true, registeredVoterId };
  }
  const serverMessage =
    typeof row.message === "string" && row.message.trim() ? row.message.trim() : "";
  return {
    matched: false,
    message:
      serverMessage && isRegistryFieldValidationMessage(serverMessage)
        ? serverMessage
        : REGISTRATION_VOTER_REGISTRY_MISMATCH_MESSAGE,
  };
}

/** Cross-match step-0 registration fields against `registered_voters` via RPC. */
export async function verifyRegisteredVoterForRegistration(
  input: VerifyRegisteredVoterInput,
): Promise<VerifyRegisteredVoterResult> {
  const { data, error } = await supabase.rpc("verify_registered_voter_for_registration", {
    p_first_name: input.firstName.trim(),
    p_middle_name: input.middleName.trim(),
    p_last_name: input.lastName.trim(),
    p_suffix: input.suffix.trim(),
    p_birth_date: input.birthDate.trim(),
    p_sex: input.sex,
    p_barangay_id: input.barangayId,
    p_voter_id_number: input.voterIdNumber.trim(),
  });

  if (error) {
    return {
      matched: false,
      message: "We could not verify your voter registration right now. Please check your connection and try again.",
    };
  }

  return parseVerifyPayload(data);
}
