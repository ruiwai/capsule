import { join, resolve } from "node:path";
import type { Recipe } from "./registry.js";
export type RecipeParams={projectRoot:string;installable?:string;target:string;args?:string[];innerEnv?:Record<string,string>;loader?:string;libraryPath?:string};
export function compileRecipe(recipe:Recipe,p:RecipeParams){
  const target=resolve(p.target),args=p.args??[];
  if(recipe.wrapperKind==="host")return {argv:[target,...args],cwd:p.projectRoot,env:p.innerEnv};
  if(recipe.wrapperKind==="nix_develop")return {argv:["nix","--extra-experimental-features","nix-command flakes","develop",p.installable??p.projectRoot,"--no-update-lock-file","-c","env",...Object.entries(p.innerEnv??{}).map(([k,v])=>`${k}=${v}`),target,...args],cwd:p.projectRoot};
  if(recipe.wrapperKind==="fhs")return {argv:["nix","--extra-experimental-features","nix-command flakes","run",`${p.installable??p.projectRoot}#capsule-fhs`,"--no-update-lock-file","--","-c",'exec env "$@"',"capsule-fhs",...Object.entries(p.innerEnv??{}).map(([k,v])=>`${k}=${v}`),target,...args],cwd:p.projectRoot};
  if(!p.loader||!p.libraryPath)throw new Error("recipe_unavailable: loader identity required");return {argv:[p.loader,"--library-path",p.libraryPath,target,...args],cwd:p.projectRoot,env:p.innerEnv};
}
