import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
export async function within(root:string,path:string){const r=await realpath(root),p=await realpath(resolve(path));const rel=relative(r,p);if(rel===""||(!rel.startsWith(`..${sep}`)&&rel!==".."&& !isAbsolute(rel)))return p;throw new Error("permission_missing: path outside approved root")}
export function validPythonModule(name:string){if(!/^[A-Za-z_]\w*(\.[A-Za-z_]\w*)*$/.test(name))throw new Error("invalid_contract: invalid module name");return name}
