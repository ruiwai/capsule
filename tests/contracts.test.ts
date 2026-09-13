import { describe,expect,it } from "vitest";
import { canonicalJson,digestRecord } from "../src/contracts/identity.js";
import { validateTaskRequest,validateTranscriptLocator } from "../src/contracts/validate.js";
import { transition } from "../src/controller/state.js";
import { validateDraft } from "../src/verification/report.js";

const cap:any={taskId:"t",digest:"a".repeat(64),request:{acceptanceUnit:{id:"u"},report:{narrativeMaxChars:100}}};
describe("WP0 contracts",()=>{
 it("canonicalizes keys and rejects non-finite values",()=>{expect(canonicalJson({b:1,a:[2]})).toBe('{"a":[2],"b":1}');expect(()=>canonicalJson(NaN)).toThrow()});
 it("excludes a record digest from its identity",()=>expect(digestRecord({a:1,digest:"old"})).toBe(digestRecord({a:1,digest:"new"})));
 it("rejects invalid authority and absent units",()=>{expect(()=>validateTaskRequest({schemaVersion:1})).toThrow(/missing/)});
 it("rejects projection locators beyond raw source",()=>expect(()=>validateTranscriptLocator({rawLineStart:5645,rawLineEnd:5645},2892)).toThrow(/raw locator/));
 it("enforces lifecycle",()=>{expect(transition("DRAFT","AUTHORIZED")).toBe("AUTHORIZED");expect(()=>transition("RUNNING","CLOSED")).toThrow()});
 it("rejects stale and self-accepting worker reports",()=>{const d:any={schemaVersion:1,taskId:"t",episodeId:"e",capsuleDigest:cap.digest,summary:"x",unitResults:[{unitId:"u",acceptance:"accepted"}]};expect(validateDraft(cap,"e",d).valid).toBe(false);d.unitResults[0].acceptance="pending";d.capsuleDigest="b".repeat(64);expect(validateDraft(cap,"e",d).valid).toBe(false)})
});
