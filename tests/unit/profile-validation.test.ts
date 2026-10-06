import { describe, expect, it } from "vitest";
import { passwordChangeFormSchema, passwordChangeSchema, profileNameSchema } from "@/lib/auth/profile-validation";

describe("profile validation", () => {
  it("trims names and accepts a single name or accented compound names", () => {
    expect(profileNameSchema.parse({ name: "  Ana Júlia D'Ávila-Santos  " }).name).toBe("Ana Júlia D'Ávila-Santos");
    expect(profileNameSchema.parse({ name: "  X  " }).name).toBe("X");
  });

  it("requires a trimmed name from 1 to 200 characters and rejects extra fields", () => {
    expect(profileNameSchema.safeParse({ name: "   " }).success).toBe(false);
    expect(profileNameSchema.safeParse({ name: "n".repeat(201) }).success).toBe(false);
    expect(profileNameSchema.safeParse({ name: "n".repeat(200) }).success).toBe(true);
    expect(profileNameSchema.safeParse({ name: "Ana", id: "someone-else" }).success).toBe(false);
  });

  it("accepts new passwords from 12 to 128 characters without trimming", () => {
    expect(passwordChangeSchema.safeParse({ currentPassword: " old ", newPassword: "n".repeat(11) }).success).toBe(false);
    expect(passwordChangeSchema.safeParse({ currentPassword: " old ", newPassword: "n".repeat(12) }).success).toBe(true);
    expect(passwordChangeSchema.safeParse({ currentPassword: " old ", newPassword: "n".repeat(128) }).success).toBe(true);
    expect(passwordChangeSchema.safeParse({ currentPassword: " old ", newPassword: "n".repeat(129) }).success).toBe(false);
    expect(passwordChangeSchema.parse({ currentPassword: " old ", newPassword: " new password ", revokeOtherSessions: false }).newPassword).toBe(" new password ");
  });

  it("checks exact confirmation and immediate reuse", () => {
    expect(passwordChangeFormSchema.safeParse({ currentPassword: "same-pass-123", newPassword: "same-pass-123", confirmPassword: "same-pass-123" }).success).toBe(false);
    expect(passwordChangeFormSchema.safeParse({ currentPassword: "current-pass-123", newPassword: "new-password-123", confirmPassword: "new-password-124" }).success).toBe(false);
    expect(passwordChangeFormSchema.safeParse({ currentPassword: " old password ", newPassword: " new password ", confirmPassword: " new password " }).success).toBe(true);
  });
});
