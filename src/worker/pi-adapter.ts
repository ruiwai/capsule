import { createAgentSession, SessionManager, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { ClosedResourceLoader } from "./resource-loader.js";
export async function createClosedWorker(options:{cwd:string;renderedCapsule:string;tools:ToolDefinition[];model?:any}){
 const names=options.tools.map(t=>t.name);const result=await createAgentSession({cwd:options.cwd,model:options.model,noTools:"all",tools:names,customTools:options.tools,resourceLoader:new ClosedResourceLoader(options.renderedCapsule),sessionManager:SessionManager.inMemory()});
 const active=(result.session as any).getActiveToolNames?.()??names;if(active.some((x:string)=>!names.includes(x)))throw new Error("provider integration expanded active tools");return {...result,resourceManifest:{freshSession:true,activeTools:active,skills:[],contextFiles:[],extensions:[]}};
}
