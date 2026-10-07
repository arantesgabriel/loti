let transactionTail: Promise<void> = Promise.resolve();

export async function serializeDomainTransaction<T>(operation: () => Promise<T>): Promise<T> {
  const previous = transactionTail;
  let release!: () => void;
  transactionTail = new Promise(resolve => { release = resolve; });
  await previous;
  try { return await operation(); }
  finally { release(); }
}
