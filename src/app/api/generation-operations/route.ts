import { NextResponse } from "next/server";
import { authorizationResponse, requireAcceptedAccount, withAccountRequest } from "@/lib/auth-server";
import { listStoredDocumentsByField } from "@/lib/document-store";
import { currentAccountGeneration } from "@/lib/account-lifecycle";
import { generationOperationStatus, type GenerationOperation } from "@/lib/generation-operations";

async function getOperation(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const account = await requireAcceptedAccount(request);
    const actor = currentAccountGeneration();
    const [active, recent] = await Promise.all([
      listStoredDocumentsByField("generationOperations", "activeOwnerUid", account.uid, 100),
      listStoredDocumentsByField("generationOperations", "uid", account.uid, 100),
    ]);
    if (active.length >= 100) return NextResponse.json({ error: "Saved course requests require reconciliation before the complete list can be shown." }, { status: 503, headers });
    const records = [...new Map([...active, ...recent].map((record) => [record.id, record])).values()];
    const operations = records.filter((record) => record.uid === account.uid && (!actor || record.accountGeneration === actor.generation))
      .sort((a, b) => Number(b.activeOwnerUid === account.uid) - Number(a.activeOwnerUid === account.uid) || String(b.updatedAt).localeCompare(String(a.updatedAt)))
      .slice(0, 100)
      .map((record) => generationOperationStatus(record as unknown as GenerationOperation));
    return NextResponse.json({ operations }, { headers });
  } catch (error) {
    return authorizationResponse(error) ?? NextResponse.json({ error: "Course operations could not be read." }, { status: 500, headers });
  }
}

export const GET = withAccountRequest(getOperation);
