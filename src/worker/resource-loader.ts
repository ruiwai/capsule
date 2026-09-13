import { createExtensionRuntime, type ResourceLoader } from "@earendil-works/pi-coding-agent";
export class ClosedResourceLoader implements ResourceLoader{
 private readonly runtime=createExtensionRuntime();
 constructor(private systemPrompt:string){}
 getExtensions(){return {extensions:[],errors:[],runtime:this.runtime}}
 getSkills(){return {skills:[],diagnostics:[]}}getPrompts(){return {prompts:[],diagnostics:[]}}getThemes(){return {themes:[],diagnostics:[]}}getAgentsFiles(){return {agentsFiles:[]}}
 getSystemPrompt(){return this.systemPrompt}getSystemPromptSource(){return undefined}getAppendSystemPrompt(){return []}getAppendSystemPromptSources(){return []}
 extendResources(_paths:never){throw new Error("closed resource manifest cannot be extended")}async reload(_options?:unknown){}
}
