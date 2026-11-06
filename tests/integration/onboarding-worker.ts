import { isAbsolute, relative, resolve } from "node:path";
import { openDatabase } from "../../src/lib/db/connection";
import { DomainError } from "../../src/lib/domain/errors";
import { onboardingServices } from "../../src/lib/onboarding/services";
import { createServices } from "../../src/lib/domain/services";
import { recordCommittedInsert } from "../../src/lib/onboarding/milestones";

const url = process.env.LOTI_ONBOARDING_TEST_DATABASE ?? "";
const filename = url.startsWith("file:") ? url.slice(5) : "";
const insideData = relative(resolve("data"), filename).replaceAll("\\", "/");
if (!isAbsolute(filename) || !/^onboarding-races-[^/]+\/state\.sqlite$/.test(insideData)) throw new Error("A new, disposable onboarding-races database is required.");
const command = JSON.parse(process.env.LOTI_ONBOARDING_TEST_COMMAND ?? "null");
const connection = openDatabase(url);
try {
  if (command?.command === "test.favorite.insert") {
    await createServices(connection.db, "alice", undefined, recordCommittedInsert).saveFavorite({ name: "Synthetic race", url: "https://example.test/race", priceCents: null }, undefined, "workspace");
    console.log(JSON.stringify({ status: "committed" }));
  } else {
  const state = await onboardingServices(connection.db, "alice").execute(command);
  console.log(JSON.stringify({ status: "saved", profile: state.profile, introduction: state.introduction, help: state.help }));
  }
} catch (error) {
  if (!(error instanceof DomainError)) throw error;
  console.log(JSON.stringify({ status: "rejected", code: error.code }));
} finally { connection.client.close(); }
