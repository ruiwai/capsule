import { readFile } from "node:fs/promises";
import { publicCall } from "./extension/index.js";

const [operation, path] = process.argv.slice(2);
if (operation === "compat") console.log(JSON.stringify({ node: process.version, backend: "trusted-local/sqlite", adaptive: "unavailable", environmentHandles: "unavailable" }));
else if (["delegate_episode", "read_evidence", "decide_episode"].includes(operation) && path) {
  const abort = new AbortController();
  process.once("SIGINT", () => abort.abort()); process.once("SIGTERM", () => abort.abort());
  const value = JSON.parse(await readFile(path, "utf8"));
  const parameters = operation === "delegate_episode" ? { request: value } : value;
  console.log(JSON.stringify(await publicCall(operation, parameters, abort.signal), null, 2));
} else throw Error("unsupported: use delegate_episode REQUEST.json | read_evidence PARAMS.json | decide_episode PARAMS.json; adaptive, demo and environment execution unavailable");
