import "server-only";
import { commandCenterEnvironmentEnabled } from "@/lib/command-center-auth";
import { normalizeCommandCenterControlsV1 } from "@/lib/command-center-schemas";
import { getStoredDocument } from "@/lib/document-store";

export async function supportSubmissionEnabled() {
  if (!commandCenterEnvironmentEnabled()) return false;
  const controls = await getStoredDocument("commandCenterControls/global");
  return normalizeCommandCenterControlsV1(controls).value.systemEnabled;
}
