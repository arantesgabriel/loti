import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { fixture, type Fixture } from "./helpers";
import { handlePublicSignup } from "@/lib/auth/registration";
import { handleAuthRequest } from "@/lib/auth/handler";
import { authEmailDeliveries, referralAttributions, referralLinks, user, workspaces, workspaceMembers } from "@/lib/db/schema";
import { referralService } from "@/lib/domain/referrals";
import type { EmailTransport } from "@/lib/email/service";

let f: Fixture;
let messages: { text: string }[] = [];
const origin = "http://localhost:3000", password = "Referral-QA-Private-2026!";
const mail: EmailTransport = async message => { messages.push(message); return "sent"; };
function signup(email: string, referralToken?: string) {
  return handlePublicSignup(f.db, new Request(`${origin}/api/activation/signup`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ name: "New person", email, password, confirmPassword: password, referralToken }) }), { emailTransport: mail });
}
beforeEach(async () => { f = await fixture(":memory:", "orders"); messages = []; vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-05T12:00:02Z")); });
afterEach(() => { f.client.close(); vi.useRealTimers(); });

describe("referral attribution", () => {
  it("idempotently creates one opaque link and attributes multiple public signups only after valid email confirmation", async () => {
    const links = await Promise.all([referralService(f.db).getOrCreate("alice"), referralService(f.db).getOrCreate("alice")]);
    expect(links[0]!.token).toBe(links[1]!.token);
    expect(links[0]!.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(links[0])).not.toContain("alice");
    for (const email of ["new-one@loti.test", "new-two@loti.test"]) {
      expect((await signup(email, links[0]!.token)).status).toBe(202);
    }
    const rows = await f.db.select().from(referralAttributions).all();
    expect(rows).toHaveLength(2);
    expect(rows.every(row => row.referrerUserId === "alice" && row.confirmedAt === null)).toBe(true);
    const delivery = await f.db.select().from(referralLinks).where(eq(referralLinks.referrerUserId, "alice")).get();
    expect(delivery?.tokenHash).not.toBe(links[0]!.token);
    const target = (await f.db.select().from(user).where(eq(user.email, "new-one@loti.test")).get())!;
    const invalid = await handleAuthRequest(f.db, new Request(`${origin}/api/auth/verify-email?token=invalid`));
    expect(invalid.status).toBe(303);
    expect((await f.db.select().from(referralAttributions).where(eq(referralAttributions.referredUserId, target.id)).get())!.confirmedAt).toBeNull();
    const link = messages[0]!.text.match(/http:\/\/localhost:3000\/\S+/)![0];
    await f.client.execute("CREATE TRIGGER fail_referral_confirmation BEFORE UPDATE ON referral_attributions BEGIN SELECT RAISE(ABORT, 'synthetic referral failure'); END");
    expect((await handleAuthRequest(f.db, new Request(link), { emailTransport: mail })).status).toBe(303);
    expect((await f.db.select().from(user).where(eq(user.id, target.id)).get())!.emailVerified).toBe(false);
    expect((await f.db.select().from(referralAttributions).where(eq(referralAttributions.referredUserId, target.id)).get())!.confirmedAt).toBeNull();
    await f.client.execute("DROP TRIGGER fail_referral_confirmation");
    expect((await handleAuthRequest(f.db, new Request(link), { emailTransport: mail })).status).toBe(302);
    expect((await f.db.select().from(referralAttributions).where(eq(referralAttributions.referredUserId, target.id)).get())!.confirmedAt).toBeInstanceOf(Date);
    expect((await f.db.select().from(authEmailDeliveries).all()).filter(row => row.kind === "verification" && row.consumedAt)).toHaveLength(1);
    expect((await handleAuthRequest(f.db, new Request(link), { emailTransport: mail })).status).toBe(303);
  });

  it("does not backfill legacy users or change a captured origin on duplicate signup", async () => {
    const token = (await referralService(f.db).getOrCreate("alice")).token!;
    expect((await signup("legacy@loti.test", token)).status).toBe(202);
    const created = (await f.db.select().from(user).where(eq(user.email, "legacy@loti.test")).get())!;
    expect((await signup("legacy@loti.test", (await referralService(f.db).getOrCreate("bob")).token!)).status).toBe(202);
    expect(await f.db.select().from(referralAttributions).where(eq(referralAttributions.referredUserId, created.id)).all()).toHaveLength(1);
    expect(await f.db.select().from(workspaceMembers).where(eq(workspaceMembers.userId, created.id)).all()).toHaveLength(0);
    expect(await f.db.select().from(workspaces).where(eq(workspaces.ownerUserId, created.id)).all()).toHaveLength(1);
  });

  it("allows direct or invalid-link signup normally and refuses links for pending accounts", async () => {
    await expect(referralService(f.db).getOrCreate("outsider")).resolves.toMatchObject({ token: expect.any(String) });
    await expect(referralService(f.db).getOrCreate("missing-user")).rejects.toMatchObject({ status: 403 });
    expect((await signup("pending-referrer@loti.test")).status).toBe(202);
    const pending = (await f.db.select().from(user).where(eq(user.email, "pending-referrer@loti.test")).get())!;
    await expect(referralService(f.db).getOrCreate(pending.id)).rejects.toMatchObject({ status: 403 });
    expect((await signup("invalid-ref@loti.test", "A".repeat(43))).status).toBe(202);
    expect((await signup("malformed-ref@loti.test", "not-a-valid-token")).status).toBe(202);
    expect((await signup("direct-ref@loti.test")).status).toBe(202);
    expect(await f.db.select().from(referralAttributions).all()).toHaveLength(0);
    expect(await f.db.select().from(user).where(eq(user.email, "malformed-ref@loti.test")).get()).toBeTruthy();
  }, 15000);
});
