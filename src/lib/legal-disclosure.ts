import { serverEnvironment } from "@/lib/runtime-environment";

function publicValue(value: string | undefined, maximumLength: number) {
  return (value ?? "").trim().replace(/\s+/g, " ").slice(0, maximumLength);
}

export function publicLegalDisclosure() {
  const operatorName = publicValue(serverEnvironment.LEGAL_OPERATOR_NAME, 160);
  const businessAddress = publicValue(serverEnvironment.LEGAL_BUSINESS_ADDRESS, 320);
  const governingJurisdiction = publicValue(serverEnvironment.GOVERNING_JURISDICTION, 160);
  const supportEmail = publicValue(serverEnvironment.SUPPORT_EMAIL, 254);

  return {
    ready: Boolean(operatorName && businessAddress && governingJurisdiction && supportEmail),
    operatorName,
    businessAddress,
    governingJurisdiction,
    supportEmail,
  };
}
