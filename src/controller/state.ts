export type EpisodePhase = "DRAFT"|"AUTHORIZED"|"RUNNING"|"REPORTING"|"AWAITING_REVIEW"|"INTERRUPTED"|"BUDGET_EXHAUSTED"|"FAILED"|"CLOSED";
const next:Record<EpisodePhase,EpisodePhase[]>={DRAFT:["AUTHORIZED"],AUTHORIZED:["RUNNING"],RUNNING:["REPORTING","INTERRUPTED","BUDGET_EXHAUSTED","FAILED"],REPORTING:["AWAITING_REVIEW","FAILED"],AWAITING_REVIEW:["CLOSED"],INTERRUPTED:[],BUDGET_EXHAUSTED:[],FAILED:[],CLOSED:[]};
export function transition(from:EpisodePhase,to:EpisodePhase){if(!next[from].includes(to))throw new Error(`invalid transition ${from} -> ${to}`);return to}
