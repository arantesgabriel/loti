import { mkdtemp, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { fixture } from "./helpers";
import { openDatabase } from "@/lib/db/connection";
import { onboardingServices } from "@/lib/onboarding/services";
import { createServices } from "@/lib/domain/services";
import { recordCommittedInsert } from "@/lib/onboarding/milestones";
import { onboardingEnrollments, onboardingHelpPreferences, onboardingRuns, onboardingMilestones, userGuidanceProfiles } from "@/lib/db/schema";

it("enforces revisions across independent processes and recovers confirmed state on a new connection", async () => {
  await mkdir(resolve("data"), { recursive: true });
  const directory = await mkdtemp(resolve("data/onboarding-races-"));
  const url = `file:${join(directory, "state.sqlite").replaceAll("\\", "/")}`;
  const first = await fixture(url, "orders");
  const execute = promisify(execFile);
  const run = async (command: unknown) => {
    const result = await execute(process.execPath, ["--conditions=react-server", "--import", "tsx", "tests/integration/onboarding-worker.ts"], {
      env: { ...process.env, TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: "", LOTI_ONBOARDING_TEST_DATABASE: url, LOTI_ONBOARDING_TEST_COMMAND: JSON.stringify(command) }, timeout: 30000,
    });
    return JSON.parse(result.stdout.trim()) as { status: string; code?: string };
  };
  const assertOneWinner = (results: { status: string; code?: string }[]) => {
    expect(results.filter(result => result.status === "saved")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toEqual([{ status: "rejected", code: "ONBOARDING_REVISION_CONFLICT" }]);
  };
  try {
    const base = { workspaceId: "workspace", expectedRevision: 0 };
    assertOneWinner(await Promise.all(["never", "expert"].map(experience => run({ command: "profile.save", ...base, patch: { experience } }))));
    assertOneWinner(await Promise.all(["intro.skip", "intro.complete"].map(command => run({ command, ...base, flowVersion: 1 }))));
    const help = { command: "help.set", ...base, helpId: "all", helpVersion: 1, proactive: false };
    assertOneWinner(await Promise.all([run(help), run(help)]));
    const inserts = await Promise.all([run({ command: "test.favorite.insert" }), run({ command: "test.favorite.insert" })]);
    expect(inserts.some(result => result.status === "committed")).toBe(true);
    expect(inserts.every(result => result.status === "committed" || result.code === "INSERT_BUSY")).toBe(true);
    expect((await first.alice.getData()).favorites).toHaveLength(inserts.filter(result => result.status === "committed").length);
    expect(await first.db.select().from(onboardingMilestones).all()).toHaveLength(1);
    if (inserts.some(result => result.code === "INSERT_BUSY")) {
      await createServices(first.db, "alice", undefined, recordCommittedInsert).saveFavorite({ name: "Synthetic retry after contention", url: "https://example.test/retry", priceCents: null }, undefined, "workspace");
      expect((await first.alice.getData()).favorites).toHaveLength(2);
      expect(await first.db.select().from(onboardingMilestones).all()).toHaveLength(1);
    }
    const recovery = openDatabase(url);
    try {
      const state = await onboardingServices(recovery.db, "alice").read("workspace");
      expect(state.profile.revision).toBe(1);
      expect(["never", "expert"]).toContain(state.profile.experience);
      expect(["completed", "skipped"]).toContain(state.introduction.status);
      expect(state.introduction.revision).toBe(1);
      expect(state.help.every(row => !row.effectiveProactive)).toBe(true);
      expect(await recovery.db.select().from(onboardingEnrollments).all()).toHaveLength(1);
      expect(await recovery.db.select().from(userGuidanceProfiles).all()).toHaveLength(1);
      expect(await recovery.db.select().from(onboardingRuns).all()).toHaveLength(1);
      expect(await recovery.db.select().from(onboardingHelpPreferences).all()).toHaveLength(1);
      expect((await recovery.client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
    } finally { recovery.client.close(); }
  } finally {
    first.client.close();
    // Dedicated ignored fixture, like the existing Windows process-race tests.
    // Native libSQL handles can outlive the worker; no broad cleanup is attempted.
  }
}, 120000);
