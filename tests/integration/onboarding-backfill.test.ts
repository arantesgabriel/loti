import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { fixture, favorite } from "./helpers";
import { onboardingMilestones } from "@/lib/db/schema";

it("validates the reviewed manifest in a dry-run, applies idempotently and rejects a remote target", async () => {
  const id = crypto.randomUUID(), database = `data/onboarding-backfill-${id}.sqlite`;
  const manifest = `artifacts/qa/onboarding/backfill-${id}.json`;
  await mkdir(resolve("artifacts/qa/onboarding"), { recursive: true });
  const f = await fixture(`file:${database}`, "orders");
  try {
    const saved = await f.alice.saveFavorite(favorite);
    await f.alice.savePurchase({ name: "Synthetic historical purchase" });
    const item = await f.alice.saveManualItem({ name: "Synthetic historical item", url: "https://example.test/old", personId: "alice", quantity: 1, unitPriceCents: null });
    await writeFile(manifest, JSON.stringify({ review: "synthetic-local-validation-2026-11-06", purpose: "synthetic-local-validation", references: [
      { userId: "alice", workspaceId: "workspace", source: "favorite", entityId: saved!.id },
      { userId: "alice", workspaceId: "workspace", source: "purchase_item", entityId: item!.id },
    ] }));
    const run = (target = database, apply = false) => promisify(execFile)(process.execPath, ["--conditions=react-server", "--import", "tsx", "scripts/backfill-onboarding.ts", "--database", target, "--manifest", manifest, ...(apply ? ["--apply"] : [])], { timeout: 30000 });
    expect(JSON.parse((await run()).stdout).mode).toBe("dry-run");
    expect(await f.db.select().from(onboardingMilestones).all()).toEqual([]);
    await run(database, true); const before = await f.db.select().from(onboardingMilestones).all();
    expect(before).toHaveLength(2); expect(before.every(row => row.evidence === "preexisting" && row.occurredAt === null)).toBe(true);
    await run(database, true); expect(await f.db.select().from(onboardingMilestones).all()).toEqual(before);
    await expect(run("libsql://not-authorized.example", true)).rejects.toThrow();
  } finally { f.client.close(); }
}, 60000);
