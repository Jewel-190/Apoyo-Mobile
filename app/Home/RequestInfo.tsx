/**
 * Legacy path `/Home/RequestInfo` → pipeline `RequesterInfo` (same query params).
 */
import { Redirect, useLocalSearchParams } from "expo-router";
import React from "react";

export default function LegacyHomeRequestInfoRedirect() {
  const params = useLocalSearchParams();
  return (
    <Redirect
      href={{ pathname: "/Home/request/RequesterInfo", params } as never}
    />
  );
}
