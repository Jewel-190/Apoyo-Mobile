import { RequestTableName } from "./requestAttachments";

const CLINICAL_ABSTRACT_PNG = require("../assets/images/ClinicalAbstract.png");
const HOSPITAL_BILL_PNG = require("../assets/images/HospitalBill.png");
const SAMPLE_LETTER_PNG = require("../assets/images/SampleLetter.png");
const DEATH_CERT_PNG = require("../assets/images/DeathCert.png");
const CREMATION_CERT_PNG = require("../assets/images/CremationCert.png");
const VOTERS_CERT_PNG = require("../assets/images/VotersCert.png");
const ENDORSEMENT_PNG = require("../assets/images/Endorsement.png");
const INDIGENCY_PNG = require("../assets/images/Indigency.png");

export type HomeRequirementItem = {
  id: string;
  title: string;
  details?: string;
};

export type HomeServiceId =
  | "hospital"
  | "treatment"
  | "operations"
  | "emergency-finance"
  | "burial-money"
  | "burial-site"
  | "cremation"
  | "colombarium";

export type RequirementTipItem = {
  id: string;
  title: string;
  details: string;
  image?: any;
};

const HOME_REQUIREMENTS_BY_SERVICE: Record<HomeServiceId, HomeRequirementItem[]> = {
  hospital: [
    {
      id: "pl",
      title: "Personal Letter",
      details:
        "A letter addressed to Mayor Jennifer Austria-Barzaga stating the specific assistance being requested.",
    },
    {
      id: "voter",
      title: "Patient's Voters ID/ Certificate",
      details:
        "Patient must be legitimate registered voters of the City of Dasmari\u00f1as.",
    },
    {
      id: "endorse",
      title: "Patient's Endorsement & Indigency Certificate",
      details:
        "Endorsement and Certificate of Indigency issued by the Barangay Captain.",
    },
    {
      id: "validid",
      title: "Patient's Valid ID",
      details: "Valid ID or Birth Certificate of the patient and requestor.",
    },
    { id: "abstract", title: "Medical Abstract" },
    { id: "bill", title: "Partial Hospital Bill" },
  ],
  treatment: [
    {
      id: "pl",
      title: "Personal Letter",
      details:
        "A letter addressed to Mayor Jennifer Austria-Barzaga stating the specific assistance being requested.",
    },
    {
      id: "voter",
      title: "Patient's Voters ID/ Certificate",
      details:
        "Patient must be legitimate registered voters of the City of Dasmari\u00f1as.",
    },
    {
      id: "endorse",
      title: "Patient's Endorsement & Indigency Certificate",
      details:
        "Endorsement and Certificate of Indigency issued by the Barangay Captain.",
    },
    {
      id: "validid",
      title: "Patient's Valid ID",
      details: "Valid ID or Birth Certificate of the patient and requestor.",
    },
    {
      id: "medcert",
      title: "Medical Certificate",
      details:
        "Latest medical certificate indicating diagnosis and recommended management/treatment.",
    },
    {
      id: "rx",
      title: "Doctor's Prescription",
      details:
        "Official prescription for medicines/procedures needed, signed by the attending physician.",
    },
    {
      id: "lab",
      title: "Laboratory Request",
      details:
        "Laboratory request or result relevant to the patient's case (if applicable).",
    },
  ],
  operations: [
    {
      id: "pl",
      title: "Personal Letter",
      details:
        "A letter addressed to Mayor Jennifer Austria-Barzaga stating the specific assistance being requested.",
    },
    {
      id: "voter",
      title: "Patient's Voters ID/ Certificate",
      details:
        "Patient must be legitimate registered voters of the City of Dasmari\u00f1as.",
    },
    {
      id: "endorse",
      title: "Patient's Endorsement & Indigency Certificate",
      details:
        "Endorsement and Certificate of Indigency issued by the Barangay Captain.",
    },
    {
      id: "validid",
      title: "Patient's Valid ID",
      details: "Valid ID or Birth Certificate of the patient and requestor.",
    },
    {
      id: "medcert",
      title: "Medical Certificate",
      details:
        "Latest medical certificate indicating diagnosis and recommended management/treatment.",
    },
    {
      id: "rx",
      title: "Doctor's Prescription",
      details:
        "Official prescription for medicines/procedures needed, signed by the attending physician.",
    },
    {
      id: "quote",
      title: "Quotation of Expenses",
      details:
        "Itemized quotation/billing statement (dialysis/chemo/procedure) from hospital/clinic.",
    },
  ],
  "emergency-finance": [
    {
      id: "pl",
      title: "Personal Letter",
      details:
        "A letter addressed to Mayor Jennifer Austria-Barzaga stating the specific assistance being requested.",
    },
    {
      id: "voter",
      title: "Applicant's Voters ID/ Certificate",
      details:
        "Applicant must be a legitimate registered voter of the City of Dasmari\u00f1as.",
    },
    {
      id: "endorse",
      title: "Endorsement & Indigency Certificate",
      details:
        "Endorsement and Certificate of Indigency issued by the Barangay Captain.",
    },
    {
      id: "validid",
      title: "Valid ID",
      details:
        "Valid ID or Birth Certificate of the applicant and requestor (if representative).",
    },
  ],
  "burial-money": [
    {
      id: "letter",
      title: "Letter of Request to the Mayor",
      details:
        "Formal request letter addressed to the City Mayor stating the type of burial monetary assistance needed.",
    },
    {
      id: "voterId",
      title: "Patient's Voter's ID / Certificate",
      details:
        "Proof that the applicant or deceased is connected to a registered voter of the City of Dasmari\u00f1as.",
    },
    {
      id: "birthCert",
      title: "Valid ID / Birth Certificate",
      details:
        "Valid government-issued ID or birth certificate of the deceased and requestor.",
    },
    {
      id: "barangay",
      title: "Barangay Endorsement",
      details:
        "Barangay-issued endorsement supporting the burial assistance request.",
    },
    {
      id: "indigency",
      title: "Certificate of Indigency",
      details:
        "Certification proving financial incapacity, issued by the barangay or local social welfare office.",
    },
  ],
  "burial-site": [
    {
      id: "deathCert",
      title: "Death Certificate",
      details: "Certified copy of the death certificate of the deceased.",
    },
    {
      id: "validId",
      title: "Valid ID of Deceased",
      details: "Any valid government-issued ID of the deceased.",
    },
    {
      id: "barangay",
      title: "Barangay Endorsement of the Deceased",
      details:
        "Barangay endorsement confirming residency and request for burial site support.",
    },
    {
      id: "indigency",
      title: "Indigency Certificate of the Deceased",
      details:
        "Indigency certificate proving financial need for burial site assistance.",
    },
  ],
  cremation: [
    {
      id: "deathCert",
      title: "Death Certificate",
      details: "Certified copy of the death certificate of the deceased.",
    },
    {
      id: "validId",
      title: "Valid ID of Deceased",
      details: "Any valid government-issued ID of the deceased.",
    },
    {
      id: "barangay",
      title: "Barangay Endorsement of the Deceased",
      details:
        "Barangay endorsement confirming request for cremation assistance.",
    },
    {
      id: "indigency",
      title: "Indigency Certificate of the Deceased",
      details:
        "Indigency certificate proving financial need for cremation support.",
    },
  ],
  colombarium: [
    {
      id: "deathCert",
      title: "Death Certificate",
      details: "Certified copy of the death certificate of the deceased.",
    },
    {
      id: "validId",
      title: "Valid ID of Deceased",
      details: "Any valid government-issued ID of the deceased.",
    },
    {
      id: "cremationCert",
      title: "Certificate of Cremation",
      details: "Official cremation certificate issued by the crematorium.",
    },
    {
      id: "barangay",
      title: "Barangay Endorsement of the Deceased",
      details:
        "Barangay endorsement confirming request for columbarium support.",
    },
    {
      id: "indigency",
      title: "Indigency Certificate of the Deceased",
      details:
        "Indigency certificate proving financial need for columbarium allocation.",
    },
  ],
};

const REQUEST_TABLE_TO_HOME_SERVICE: Record<RequestTableName, HomeServiceId> = {
  hospitalization_requests: "hospital",
  treatment_requests: "treatment",
  medical_requests: "operations",
  financial_requests: "emergency-finance",
  monetary_requests: "burial-money",
  burial_requests: "burial-site",
  cremation_requests: "cremation",
  columbarium_requests: "colombarium",
};

const ATTACHMENT_TO_HOME_REQUIREMENT_ID: Record<HomeServiceId, Record<string, string>> = {
  hospital: {
    letter_file: "pl",
    voter_id_file: "voter",
    birth_cert_file: "validid",
    valid_id_file: "validid",
    barangay_endorsement_file: "endorse",
    indigency_cert_file: "endorse",
    abstract_file: "abstract",
    bill_file: "bill",
  },
  treatment: {
    letter_file: "pl",
    voter_id_file: "voter",
    birth_cert_file: "validid",
    valid_id_file: "validid",
    barangay_endorsement_file: "endorse",
    indigency_cert_file: "endorse",
    med_cert_file: "medcert",
    rx_file: "rx",
    lab_file: "lab",
  },
  operations: {
    letter_file: "pl",
    voter_id_file: "voter",
    birth_cert_file: "validid",
    valid_id_file: "validid",
    barangay_endorsement_file: "endorse",
    indigency_cert_file: "endorse",
    med_cert_file: "medcert",
    prescription_file: "rx",
    quotation_file: "quote",
  },
  "emergency-finance": {
    letter_file: "pl",
    voter_id_file: "voter",
    valid_id_file: "validid",
    birth_cert_file: "validid",
    barangay_endorsement_file: "endorse",
    indigency_cert_file: "endorse",
  },
  "burial-money": {
    letter_file: "letter",
    voter_id_file: "voterId",
    voters_id_or_cert_file: "voterId",
    birth_cert_file: "birthCert",
    valid_id_or_birth_cert_file: "birthCert",
    barangay_endorsement_file: "barangay",
    indigency_cert_file: "indigency",
  },
  "burial-site": {
    death_cert_file: "deathCert",
    valid_id_file: "validId",
    barangay_endorsement_file: "barangay",
    indigency_cert_file: "indigency",
  },
  cremation: {
    death_cert_file: "deathCert",
    valid_id_file: "validId",
    barangay_endorsement_file: "barangay",
    indigency_cert_file: "indigency",
  },
  colombarium: {
    death_cert_file: "deathCert",
    valid_id_file: "validId",
    cremation_cert_file: "cremationCert",
    barangay_endorsement_file: "barangay",
    indigency_cert_file: "indigency",
  },
};

type RequirementTipsByService = Record<
  HomeServiceId,
  Record<string, RequirementTipItem[]>
>;

const REQUIREMENT_TIPS_BY_SERVICE: RequirementTipsByService = {
  hospital: {
    pl: [
      {
        id: "format",
        title: "Format for Personal Letter",
        details:
          "Include date, full name, contact details, reason for assistance, brief hospitalization details, requested amount, and signature.",
      },
      {
        id: "sample",
        title: "Sample Document",
        details: "Use a clear and formal letter addressed to the City Mayor.",
        image: SAMPLE_LETTER_PNG,
      },
    ],
    voter: [
      {
        id: "where",
        title: "Where to Get It",
        details:
          "Go to the COMELEC Office (Office of the Election Officer) in your city.",
      },
      {
        id: "bring",
        title: "What to Bring",
        details:
          "Bring a valid government ID, request form, and authorization letter if claiming on behalf of another person.",
      },
      {
        id: "how",
        title: "How to Get It",
        details:
          "Have your record checked, pay any required fee, submit receipt and form, then claim the certificate.",
      },
      {
        id: "sample",
        title: "Sample Document",
        details: "",
        image: VOTERS_CERT_PNG,
      },
    ],
    endorse: [
      {
        id: "barangay",
        title: "Barangay Endorsement Tips",
        details:
          "Request this at your Barangay Hall, bring valid ID and supporting medical documents, and ensure signed/sealed issuance.",
        image: ENDORSEMENT_PNG,
      },
      {
        id: "indigency",
        title: "Certificate of Indigency Tips",
        details:
          "Get this from Barangay Hall or CSWDO, bring proof of residency and valid ID, then claim the signed certificate.",
        image: INDIGENCY_PNG,
      },
    ],
    validid: [
      {
        id: "accepted",
        title: "Accepted IDs",
        details:
          "Accepted IDs include PhilID/ePhilID, Passport, Driver's License, UMID, PRC, Postal ID, Voter's ID/Certificate, SSS/GSIS, Senior Citizen ID, PWD ID, TIN, and PhilHealth.",
      },
      {
        id: "sample",
        title: "Sample Document",
        details: "",
        image: VOTERS_CERT_PNG,
      },
    ],
    abstract: [
      {
        id: "where",
        title: "Where to Get It",
        details:
          "Go to the Medical Records Department of the hospital where the patient was admitted.",
      },
      {
        id: "bring",
        title: "What to Bring",
        details:
          "Bring a valid ID, hospital card, and authorization letter with IDs if claiming for someone else.",
      },
      {
        id: "how",
        title: "How to Get It",
        details:
          "Fill out the request form, pay the processing fee, and return on the scheduled claim date.",
      },
      {
        id: "sample",
        title: "Sample Document",
        details: "",
        image: CLINICAL_ABSTRACT_PNG,
      },
    ],
    bill: [
      {
        id: "where",
        title: "Where to Get It",
        details:
          "Request this from the Billing Section of the hospital where confinement happened.",
      },
      {
        id: "bring",
        title: "What to Bring",
        details:
          "Prepare valid ID, hospital card, and authorization requirements when claiming for another person.",
      },
      {
        id: "how",
        title: "How to Get It",
        details:
          "Ask for a Statement of Account or finalized bill, settle any required payments, then claim the printed bill.",
      },
      {
        id: "sample",
        title: "Sample Document",
        details: "",
        image: HOSPITAL_BILL_PNG,
      },
    ],
  },
  treatment: {
    pl: [
      {
        id: "format",
        title: "Format for Personal Letter",
        details:
          "State your treatment/procedure request, patient details, diagnosis summary, and contact information.",
        image: SAMPLE_LETTER_PNG,
      },
    ],
    voter: [
      {
        id: "where",
        title: "How to Get Voter's Certificate",
        details:
          "Request this at the local COMELEC office and bring a valid ID for verification.",
        image: VOTERS_CERT_PNG,
      },
    ],
    endorse: [
      {
        id: "barangay",
        title: "Barangay Endorsement",
        details:
          "Ask your barangay for an endorsement letter supporting your treatment request.",
        image: ENDORSEMENT_PNG,
      },
      {
        id: "indigency",
        title: "Certificate of Indigency",
        details:
          "Secure an indigency certificate from the barangay or CSWDO for financial need verification.",
        image: INDIGENCY_PNG,
      },
    ],
    validid: [
      {
        id: "accepted",
        title: "Accepted IDs",
        details:
          "Any government-issued ID may be used. If unavailable, submit a birth certificate.",
      },
    ],
    medcert: [
      {
        id: "request",
        title: "Medical Certificate",
        details:
          "Request an updated certificate with diagnosis and recommended treatment from your attending physician.",
      },
    ],
    rx: [
      {
        id: "request",
        title: "Doctor's Prescription",
        details:
          "Submit a signed and dated prescription reflecting current treatment needs.",
      },
    ],
    lab: [
      {
        id: "request",
        title: "Laboratory Request",
        details:
          "Provide lab requests/results relevant to the treatment to support medical necessity.",
      },
    ],
  },
  operations: {
    pl: [
      {
        id: "format",
        title: "Format for Personal Letter",
        details:
          "Specify the operation, estimated cost, and assistance amount requested in your letter.",
        image: SAMPLE_LETTER_PNG,
      },
    ],
    voter: [
      {
        id: "where",
        title: "How to Get Voter's Certificate",
        details:
          "Request this at COMELEC and make sure the name matches your submitted IDs.",
        image: VOTERS_CERT_PNG,
      },
    ],
    endorse: [
      {
        id: "barangay",
        title: "Barangay Endorsement",
        details:
          "Request endorsement from your barangay and ensure it clearly states operation assistance.",
        image: ENDORSEMENT_PNG,
      },
      {
        id: "indigency",
        title: "Certificate of Indigency",
        details: "Obtain an indigency certificate for financial assessment.",
        image: INDIGENCY_PNG,
      },
    ],
    validid: [
      {
        id: "accepted",
        title: "Accepted IDs",
        details:
          "Use any valid government ID or a birth certificate when applicable.",
      },
    ],
    medcert: [
      {
        id: "request",
        title: "Medical Certificate",
        details:
          "Include diagnosis and recommendation for surgery, chemotherapy, dialysis, or related procedure.",
      },
    ],
    rx: [
      {
        id: "request",
        title: "Doctor's Prescription",
        details:
          "Provide current prescription and treatment plan signed by the physician.",
      },
    ],
    quote: [
      {
        id: "request",
        title: "Quotation of Expenses",
        details:
          "Submit an itemized quotation from the hospital/clinic that matches the required operation.",
      },
    ],
  },
  "emergency-finance": {
    pl: [
      {
        id: "format",
        title: "Format for Personal Letter",
        details:
          "Describe the emergency situation, requested amount, and immediate use of funds.",
        image: SAMPLE_LETTER_PNG,
      },
    ],
    voter: [
      {
        id: "where",
        title: "How to Get Voter's Certificate",
        details:
          "Claim this from COMELEC with a valid ID and correct personal details.",
        image: VOTERS_CERT_PNG,
      },
    ],
    endorse: [
      {
        id: "barangay",
        title: "Barangay Endorsement",
        details:
          "Secure barangay endorsement that references your emergency financial need.",
        image: ENDORSEMENT_PNG,
      },
      {
        id: "indigency",
        title: "Certificate of Indigency",
        details:
          "Provide proof of financial hardship via barangay or social welfare indigency certification.",
        image: INDIGENCY_PNG,
      },
    ],
    validid: [
      {
        id: "accepted",
        title: "Accepted IDs",
        details:
          "Submit any valid government-issued ID. Birth certificate is accepted when needed.",
      },
    ],
  },
  "burial-money": {
    letter: [
      {
        id: "format",
        title: "Format for Personal Letter",
        details:
          "State the deceased's name, date of death, and specific burial monetary aid being requested.",
        image: SAMPLE_LETTER_PNG,
      },
    ],
    voterId: [
      {
        id: "where",
        title: "How to Get Voter's Certificate",
        details:
          "Request from COMELEC and ensure details are consistent with other documents.",
        image: VOTERS_CERT_PNG,
      },
    ],
    birthCert: [
      {
        id: "accepted",
        title: "Accepted Document",
        details:
          "You may submit a valid ID or birth certificate of the deceased/requestor.",
      },
    ],
    barangay: [
      {
        id: "where",
        title: "Barangay Endorsement",
        details:
          "Request endorsement at the barangay hall and verify signature and seal.",
        image: ENDORSEMENT_PNG,
      },
    ],
    indigency: [
      {
        id: "where",
        title: "Certificate of Indigency",
        details: "Get this from barangay or CSWDO after financial assessment.",
        image: INDIGENCY_PNG,
      },
    ],
  },
  "burial-site": {
    deathCert: [
      {
        id: "where",
        title: "Where to Get It",
        details:
          "Request a certified death certificate from the Local Civil Registrar.",
        image: DEATH_CERT_PNG,
      },
    ],
    validId: [
      {
        id: "accepted",
        title: "Accepted IDs",
        details: "Submit any valid government-issued ID of the deceased.",
      },
    ],
    barangay: [
      {
        id: "where",
        title: "Barangay Endorsement",
        details:
          "Request endorsement from your barangay for burial site assistance.",
        image: ENDORSEMENT_PNG,
      },
    ],
    indigency: [
      {
        id: "where",
        title: "Certificate of Indigency",
        details:
          "Submit indigency certification from barangay or local social welfare office.",
        image: INDIGENCY_PNG,
      },
    ],
  },
  cremation: {
    deathCert: [
      {
        id: "where",
        title: "Where to Get It",
        details:
          "Request a certified death certificate from the Local Civil Registrar.",
        image: DEATH_CERT_PNG,
      },
    ],
    validId: [
      {
        id: "accepted",
        title: "Accepted IDs",
        details: "Submit any valid government-issued ID of the deceased.",
      },
    ],
    barangay: [
      {
        id: "where",
        title: "Barangay Endorsement",
        details:
          "Request endorsement from your barangay for cremation assistance.",
        image: ENDORSEMENT_PNG,
      },
    ],
    indigency: [
      {
        id: "where",
        title: "Certificate of Indigency",
        details:
          "Submit indigency certification from barangay or local social welfare office.",
        image: INDIGENCY_PNG,
      },
    ],
  },
  colombarium: {
    deathCert: [
      {
        id: "where",
        title: "Where to Get It",
        details:
          "Request a certified death certificate from the Local Civil Registrar.",
        image: DEATH_CERT_PNG,
      },
    ],
    validId: [
      {
        id: "accepted",
        title: "Accepted IDs",
        details: "Submit any valid government-issued ID of the deceased.",
      },
    ],
    cremationCert: [
      {
        id: "where",
        title: "Certificate of Cremation",
        details:
          "Request a certified cremation certificate from the crematorium that handled the service.",
        image: CREMATION_CERT_PNG,
      },
    ],
    barangay: [
      {
        id: "where",
        title: "Barangay Endorsement",
        details:
          "Request endorsement from your barangay for columbarium allocation support.",
        image: ENDORSEMENT_PNG,
      },
    ],
    indigency: [
      {
        id: "where",
        title: "Certificate of Indigency",
        details:
          "Submit indigency certification from barangay or local social welfare office.",
        image: INDIGENCY_PNG,
      },
    ],
  },
};

export function normalizeHomeServiceId(
  serviceId?: string | null
): HomeServiceId | null {
  const raw = (serviceId || "").toString().trim().toLowerCase();
  if (!raw) return null;
  if (raw === "columbarium") return "colombarium";

  const values = Object.keys(HOME_REQUIREMENTS_BY_SERVICE) as HomeServiceId[];
  return values.includes(raw as HomeServiceId) ? (raw as HomeServiceId) : null;
}

export function homeServiceIdForRequestTable(
  requestTable?: RequestTableName | null
): HomeServiceId | null {
  if (!requestTable) return null;
  return REQUEST_TABLE_TO_HOME_SERVICE[requestTable] || null;
}

export function getHomeRequirements(serviceId?: string | null): HomeRequirementItem[] {
  const normalized = normalizeHomeServiceId(serviceId);
  if (!normalized) return [];
  return HOME_REQUIREMENTS_BY_SERVICE[normalized] || [];
}

export function getHomeRequirementLabelForAttachment(params: {
  requestTable?: RequestTableName | null;
  serviceId?: string | null;
  dbFileType: string;
}): string | null {
  const byService =
    normalizeHomeServiceId(params.serviceId) ||
    homeServiceIdForRequestTable(params.requestTable || null);

  if (!byService) return null;

  const requirementId = ATTACHMENT_TO_HOME_REQUIREMENT_ID[byService]?.[params.dbFileType];
  if (!requirementId) return null;

  const requirement = HOME_REQUIREMENTS_BY_SERVICE[byService].find(
    (item) => item.id === requirementId
  );

  return requirement?.title || null;
}

export function getHomeRequirementIdForAttachment(params: {
  requestTable?: RequestTableName | null;
  serviceId?: string | null;
  dbFileType: string;
}): string | null {
  const byService =
    normalizeHomeServiceId(params.serviceId) ||
    homeServiceIdForRequestTable(params.requestTable || null);

  if (!byService) return null;

  return ATTACHMENT_TO_HOME_REQUIREMENT_ID[byService]?.[params.dbFileType] || null;
}

export function getHomeRequirementTips(params: {
  serviceId?: string | null;
  requirementId?: string | null;
}): RequirementTipItem[] {
  const serviceId = normalizeHomeServiceId(params.serviceId);
  if (!serviceId || !params.requirementId) return [];

  return REQUIREMENT_TIPS_BY_SERVICE[serviceId]?.[params.requirementId] || [];
}

export function getHomeRequirementTipsForAttachment(params: {
  requestTable?: RequestTableName | null;
  serviceId?: string | null;
  dbFileType: string;
}): RequirementTipItem[] {
  const serviceId =
    normalizeHomeServiceId(params.serviceId) ||
    homeServiceIdForRequestTable(params.requestTable || null);

  if (!serviceId) return [];

  const requirementId = getHomeRequirementIdForAttachment({
    requestTable: params.requestTable,
    serviceId,
    dbFileType: params.dbFileType,
  });

  if (!requirementId) return [];

  return getHomeRequirementTips({ serviceId, requirementId });
}
