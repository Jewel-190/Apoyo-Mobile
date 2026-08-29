import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  composeResidenceAddress,
  localMobileDigits,
  normalizePhMobile,
  parseResidenceAddress,
  phoneValidationMessage,
  residenceValidationMessage,
  buildApplicantContactPatch,
} from "./ApplicantProfileContact";

describe("PH mobile normalization", () => {
  it("formats a 10-digit number starting with 9 the same way registration does", () => {
    assert.equal(normalizePhMobile("9983011200"), "+63 998 301 1200");
    assert.equal(localMobileDigits("+63 998 301 1200"), "9983011200");
  });

  it("accepts stored 63 and 09 prefixes without changing the local number", () => {
    assert.equal(localMobileDigits("639983011200"), "9983011200");
    assert.equal(localMobileDigits("09983011200"), "9983011200");
    assert.equal(normalizePhMobile("0998 301 1200"), "+63 998 301 1200");
  });

  it("rejects numbers that are not a PH mobile", () => {
    assert.equal(normalizePhMobile("8123456789"), "");
    assert.equal(normalizePhMobile("99830112"), "");
    assert.match(phoneValidationMessage("8123456789") ?? "", /start with 9/i);
    assert.equal(phoneValidationMessage("9983011200"), null);
  });
});

describe("residence address parse/compose", () => {
  it("round-trips the registration composed format", () => {
    const composed = composeResidenceAddress({
      houseUnit: "Blk 4 Lot 12",
      streetLine: "Mabini St.",
      barangay: "San Agustin I",
    });
    assert.equal(
      composed,
      "Blk 4 Lot 12, Mabini St., San Agustin I, Dasmariñas, Cavite"
    );

    const parsed = parseResidenceAddress(composed, "San Agustin I");
    assert.equal(parsed.houseUnit, "Blk 4 Lot 12");
    assert.equal(parsed.streetLine, "Mabini St.");
    assert.equal(parsed.barangay, "San Agustin I");
  });

  it("keeps commas inside the street by splitting on the barangay snapshot", () => {
    const address =
      "123, Phase 2, Block 3, San Agustin I, Dasmariñas, Cavite";
    const parsed = parseResidenceAddress(address, "San Agustin I");
    assert.equal(parsed.houseUnit, "123");
    assert.equal(parsed.streetLine, "Phase 2, Block 3");
    assert.equal(parsed.barangay, "San Agustin I");
  });

  it("does not let a save rewrite barangay or city", () => {
    const next = composeResidenceAddress({
      houseUnit: "99",
      streetLine: "New Street",
      barangay: "San Agustin I",
    });
    assert.match(next, /San Agustin I, Dasmariñas, Cavite$/);
    assert.doesNotMatch(next, /Salitran/i);
  });

  it("requires both inputtable address fields", () => {
    assert.match(residenceValidationMessage("", "Mabini") ?? "", /house/i);
    assert.match(residenceValidationMessage("12", "") ?? "", /street/i);
    assert.equal(residenceValidationMessage("12", "Mabini St."), null);
  });
});

describe("applicant contact patch", () => {
  it("updates only phone and composed address", () => {
    const result = buildApplicantContactPatch({
      mobileDigits: "9123456789",
      houseUnit: "Unit 5",
      streetLine: "Purok 2",
      barangay: "Burol I",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(Object.keys(result.patch).sort(), ["address", "contact_number"]);
    assert.equal(result.patch.contact_number, "+63 912 345 6789");
    assert.equal(
      result.patch.address,
      "Unit 5, Purok 2, Burol I, Dasmariñas, Cavite"
    );
  });

  it("does not emit a patch when identity-linked barangay is missing", () => {
    const result = buildApplicantContactPatch({
      mobileDigits: "9123456789",
      houseUnit: "Unit 5",
      streetLine: "Purok 2",
      barangay: "",
    });
    assert.equal(result.ok, false);
  });

  it("treats unchanged valid values as a no-op rather than wiping fields", () => {
    const current = {
      contact_number: "+63 912 345 6789",
      address: "Unit 5, Purok 2, Burol I, Dasmariñas, Cavite",
    };
    const result = buildApplicantContactPatch({
      mobileDigits: "9123456789",
      houseUnit: "Unit 5",
      streetLine: "Purok 2",
      barangay: "Burol I",
      current,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.unchanged, true);
    assert.equal(result.patch.contact_number, current.contact_number);
    assert.equal(result.patch.address, current.address);
  });
});
