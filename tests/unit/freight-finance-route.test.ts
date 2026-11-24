import {beforeEach,expect,it,vi} from "vitest";
import {DomainError} from "@/lib/domain/errors";
const mocks=vi.hoisted(()=>({user:vi.fn(),access:vi.fn(),freight:vi.fn(),settlement:vi.fn(),refund:vi.fn()}));
vi.mock("@/lib/auth/session",()=>({requireUser:mocks.user}));
vi.mock("@/lib/auth/origin",()=>({authOrigin:()=>"http://localhost:3294"}));
vi.mock("@/lib/db",()=>({db:{}}));
vi.mock("@/lib/domain/authorization",()=>({authorization:()=>({requireActiveWorkspaceContext:mocks.access})}));
vi.mock("@/lib/domain/package-freight-services",()=>({packageFreightServices:mocks.freight}));
vi.mock("@/lib/domain/package-settlement-services",()=>({packageSettlementServices:mocks.settlement}));
vi.mock("@/lib/domain/freight-refunds",()=>({freightRefundServices:mocks.refund}));
import {GET,POST} from "@/app/api/logistics/packages/[packageId]/finance/route";
const context={params:Promise.resolve({packageId:"synthetic-package"})};
const methods=()=>Object.fromEntries(["get","preview","confirm","previewReversal","reverse","previewReceipt","recordReceipt","previewReceiptReversal","reverseReceipt","record"].map(key=>[key,vi.fn().mockResolvedValue({synthetic:true})]));
let freight:ReturnType<typeof methods>,settlement:ReturnType<typeof methods>,refund:ReturnType<typeof methods>;
const request=(body:unknown,origin="http://localhost:3294")=>new Request("http://localhost:3294/api/logistics/packages/synthetic-package/finance",{method:"POST",headers:{origin,"Content-Type":"application/json"},body:JSON.stringify(body)});
beforeEach(()=>{vi.resetAllMocks();mocks.user.mockResolvedValue({id:"alice"});mocks.access.mockResolvedValue({kind:"shared"});freight=methods();settlement=methods();refund=methods();mocks.freight.mockReturnValue(freight);mocks.settlement.mockReturnValue(settlement);mocks.refund.mockReturnValue(refund);});
it.each([
 ["freight.preview","freight","preview"],["freight.confirm","freight","confirm"],["freight.reversal.preview","freight","previewReversal"],["freight.reverse","freight","reverse"],
 ["settlement.preview","settlement","preview"],["settlement.confirm","settlement","confirm"],["conversion.preview","settlement","preview"],["conversion.confirm","settlement","confirm"],
 ["receipt.preview","settlement","previewReceipt"],["receipt.record","settlement","recordReceipt"],["receipt.reversal.preview","settlement","previewReceiptReversal"],["receipt.reverse","settlement","reverseReceipt"],
 ["refund.preview","refund","preview"],["refund.record","refund","record"],["refund.reversal.preview","refund","previewReversal"],["refund.reverse","refund","reverse"],
])("dispatches authenticated %s with explicit workspace",async(operation,service,method)=>{const command={idempotencyKey:"synthetic"};const response=await POST(request({workspaceId:"workspace",operation,command}),context);expect(response.status).toBe(200);expect(response.headers.get("Cache-Control")).toBe("private, no-store");expect(({freight,settlement,refund}[service as "freight"])[method]).toHaveBeenCalledWith("synthetic-package",command);});
it("rejects foreign origins before session and services",async()=>{expect((await POST(request({operation:"freight.confirm",workspaceId:"workspace",command:{}},"https://foreign.invalid"),context)).status).toBe(403);expect(mocks.user).not.toHaveBeenCalled();expect(mocks.freight).not.toHaveBeenCalled();});
it("rejects missing sessions and forged actor envelopes",async()=>{mocks.user.mockRejectedValueOnce(new DomainError("Sessão necessária",401));expect((await POST(request({operation:"freight.confirm",workspaceId:"workspace",command:{}}),context)).status).toBe(401);expect(mocks.freight).not.toHaveBeenCalled();expect((await POST(request({operation:"freight.confirm",workspaceId:"workspace",actorId:"foreign",command:{}}),context)).status).toBe(400);expect(mocks.freight).not.toHaveBeenCalled();});
it("omits group settlement entirely in a personal workspace",async()=>{mocks.access.mockResolvedValue({kind:"personal"});const response=await GET(new Request("http://localhost:3294/api/logistics/packages/synthetic-package/finance?workspaceId=personal"),context);expect(response.status).toBe(200);expect((await response.json()).data.settlement).toBeNull();expect(mocks.settlement).not.toHaveBeenCalled();});
