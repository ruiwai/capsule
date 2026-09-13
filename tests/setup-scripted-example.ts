// Explicit operator setup of disposable SYNTHETIC execution authority.
// Do not expose this program as a model/task tool.
import { fixture } from "./scripted-fixture.js";
const f = fixture(); f.service.close();
console.log(JSON.stringify({ config: f.configPath, request: f.requestPath, state: f.config.stateRoot, classification: "synthetic disposable operator fixture" }, null, 2));
