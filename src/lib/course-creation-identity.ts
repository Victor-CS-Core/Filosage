export type CreationIdentity = { signature: string; key: string; operationId?: string };

/** A changed form or a lost response never authorizes another paid operation. */
export function retainCreationIdentity(current: CreationIdentity | null, signature: string, createKey: () => string): CreationIdentity {
  return current ?? { signature, key: createKey() };
}
