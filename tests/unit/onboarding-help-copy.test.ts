import { expect, it } from "vitest";
import { guidanceCopy } from "@/lib/onboarding/help-copy";
const profile = { experience: "unspecified" as const, usageIntent: "unspecified" as const, revision: 0, updatedAt: null };
it("adjusts only guidance to explicit answers and actual workspace context", () => {
  expect(guidanceCopy({ ...profile, experience: "expert" }, { kind: "favorites", shared: false, populated: false }).title).toBe("Seu próximo achado");
  expect(guidanceCopy({ ...profile, usageIntent: "group" }, { kind: "favorites", shared: false, populated: false }).description).toContain("convite");
  expect(guidanceCopy(profile, { kind: "favorites", shared: true, populated: true }).title).toBe("Salve uma descoberta sua");
  expect(guidanceCopy({ ...profile, experience: "never" }, { kind: "purchase", shared: false, populated: false }).description).toContain("Criar a compra não adiciona itens");
});
