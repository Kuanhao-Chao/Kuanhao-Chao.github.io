/** A normalized global M/I/D profile core, not full HMMER Plan7.
 * Legacy Plan7 names remain for callers. No N/J/C states or local entry/exit.
 * Emissions are estimated from match columns; transitions are declared priors.
 */
export interface Plan7Transitions { MM:number[]; MI:number[]; MD:number[]; IM:number[]; II:number[]; DM:number[]; DD:number[] }
export interface Plan7Model {
  name:string; alphabet:string[]; K:number; background:Record<string,number>;
  transitions:Plan7Transitions; matchEmissions:Record<string,number>[];
  insertEmissions:Record<string,number>[]; endProbabilities:{M:number;I:number;D:number};
  matchColumns:number[];
}
export type ProfileState = 'M'|'I'|'D';
export interface ProfileEvent { i:number;k:number;state:ProfileState;value:number;candidates:{state:ProfileState;value:number}[] }
export interface ViterbiStep { step:number;residueIdx:number;char:string;stateType:ProfileState|'B'|'E';k:number }
export interface ViterbiResult {
  logScore:number;viterbiPath:ViterbiStep[];
  matrixM:number[][];matrixI:number[][];matrixD:number[][];
  traceM:string[][];traceI:string[][];traceD:string[][];events:ProfileEvent[];
}
export interface ForwardBackwardResult {
  logLikelihood:number;forwardM:number[][];forwardI:number[][];forwardD:number[][];
  backwardM:number[][];backwardI:number[][];backwardD:number[][];
  posteriorM:number[][];posteriorI:number[][];posteriorD:number[][];events:ProfileEvent[];
}
export const PROTEIN_ALPHABET = ['A','C','D','E','F','G','H','I','K','L','M','N','P','Q','R','S','T','V','W','Y'];
export const DNA_ALPHABET = ['A','C','G','T'];
const log = (p:number) => p === 0 ? -Infinity : Math.log(p);
export function logSumExp(a:number,b:number):number {
  if (a === -Infinity) return b; if (b === -Infinity) return a;
  const max = Math.max(a,b); return max + Math.log1p(Math.exp(-Math.abs(a-b)));
}
export const logSumExpArray = (values:number[]):number => values.reduce(logSumExp,-Infinity);
export function createPlan7ModelFromMSA(msaInput:string[]|string,modelName='Profile_Model',alphabet=PROTEIN_ALPHABET):Plan7Model {
  const seqs = (Array.isArray(msaInput)?msaInput:msaInput.split(/[\n,;]+/)).map(s=>s.trim().toUpperCase()).filter(Boolean);
  if (!seqs.length) throw new Error('MSA input is empty.');
  if (seqs.some(s=>s.length !== seqs[0].length)) throw new Error('MSA rows must have equal lengths; gaps must be explicit.');
  if (!alphabet.length || new Set(alphabet).size !== alphabet.length || seqs.some(s=>[...s].some(c=>c !== '-' && !alphabet.includes(c)))) throw new Error('MSA contains a residue outside the selected alphabet. Use - for gaps.');
  const matchColumns = [...seqs[0]].flatMap((_,c)=>seqs.filter(s=>s[c] !== '-').length/seqs.length >= .5 ? [c] : []);
  const K=matchColumns.length;
  if (!K) throw new Error('No match columns reach 50% occupancy; an all-gap profile is not invented.');
  if (K>100 || seqs.length>100) throw new Error('Teaching model limit: 100 match positions and 100 MSA rows.');
  const background = Object.fromEntries(alphabet.map(a=>[a,1/alphabet.length]));
  const transitions:Plan7Transitions={MM:Array(K+1).fill(.85),MI:Array(K+1).fill(.08),MD:Array(K+1).fill(.07),IM:Array(K+1).fill(.6),II:Array(K+1).fill(.4),DM:Array(K+1).fill(.7),DD:Array(K+1).fill(.3)};
  for (const key of ['MM','MD','IM','DM','DD'] as const) transitions[key][K]=0;
  transitions.DM[0]=0;transitions.DD[0]=0; // no D0 state
  const matchEmissions:Record<string,number>[]=[{}];
  for (const col of matchColumns) {
    const counts=Object.fromEntries(alphabet.map(a=>[a,.1]));
    for (const s of seqs) if (s[col] !== '-') counts[s[col]]++;
    const total=Object.values(counts).reduce((a,b)=>a+b,0);
    matchEmissions.push(Object.fromEntries(alphabet.map(a=>[a,counts[a]/total])));
  }
  return {name:modelName,alphabet,K,background,transitions,matchEmissions,insertEmissions:Array.from({length:K+1},()=>({...background})),endProbabilities:{M:.92,I:.6,D:1},matchColumns};
}
function sequence(model:Plan7Model,input:string):string {
  const seq=input.trim().toUpperCase();
  if ([...seq].some(c=>!model.alphabet.includes(c))) throw new Error('Query residues must belong to the selected alphabet; query gaps are not accepted.');
  if (seq.length>200) throw new Error('Teaching query limit: 200 residues.');
  return seq;
}
function forward(model:Plan7Model,seq:string,mode:'max'|'sum') {
  const N=seq.length,K=model.K,t=model.transitions;
  const matrix=()=>Array.from({length:N+1},()=>Array<number>(K+1).fill(-Infinity));
  const values={M:matrix(),I:matrix(),D:matrix()};
  const trace={M:Array.from({length:N+1},()=>Array<string>(K+1).fill('')),I:Array.from({length:N+1},()=>Array<string>(K+1).fill('')),D:Array.from({length:N+1},()=>Array<string>(K+1).fill(''))};
  const events:ProfileEvent[]=[];
  const put=(state:ProfileState,i:number,k:number,candidates:{state:ProfileState;value:number}[],emission=0)=>{
    const combined=mode==='max'?Math.max(...candidates.map(c=>c.value)):logSumExpArray(candidates.map(c=>c.value));
    values[state][i][k]=combined+emission;
    if (mode==='max' && combined!==-Infinity) trace[state][i][k]=candidates.find(c=>c.value===combined)!.state;
    events.push({i,k,state,value:values[state][i][k],candidates:candidates.map(c=>({...c,value:c.value+emission}))});
  };
  values.M[0][0]=0;
  events.push({i:0,k:0,state:'M',value:0,candidates:[]});
  for (let i=0;i<=N;i++) for (let k=0;k<=K;k++) {
    if (i>0) {
      if (k>0) put('M',i,k,[
        {state:'M',value:values.M[i-1][k-1]+log(t.MM[k-1])},
        {state:'I',value:values.I[i-1][k-1]+log(t.IM[k-1])},
        {state:'D',value:values.D[i-1][k-1]+log(t.DM[k-1])},
      ],log(model.matchEmissions[k][seq[i-1]]));
      put('I',i,k,[{state:'M',value:values.M[i-1][k]+log(t.MI[k])},{state:'I',value:values.I[i-1][k]+log(t.II[k])}],log(model.insertEmissions[k][seq[i-1]]));
    }
    // Silent deletion must follow the newly computed M in this same row.
    if (k>0) put('D',i,k,[{state:'M',value:values.M[i][k-1]+log(t.MD[k-1])},{state:'D',value:values.D[i][k-1]+log(t.DD[k-1])}]);
  }
  const endings=(['M','I','D'] as const).map(state=>({state,value:values[state][N][K]+log(model.endProbabilities[state])}));
  const score=mode==='max'?Math.max(...endings.map(e=>e.value)):logSumExpArray(endings.map(e=>e.value));
  return {values,trace,events,score,endings};
}
export function runViterbi(model:Plan7Model,querySeq:string):ViterbiResult {
  const seq=sequence(model,querySeq); const f=forward(model,seq,'max');
  let i=seq.length,k=model.K,state=f.endings.find(e=>e.value===f.score)!.state;
  const reversed:ViterbiStep[]=[];
  if (f.score!==-Infinity) while(i>0 || k>0) {
    reversed.push({step:0,residueIdx:state==='D'?0:i,char:state==='D'?'-':seq[i-1],stateType:state,k});
    const prev=f.trace[state][i][k] as ProfileState;
    if (!prev) throw new Error('Missing reachable Viterbi predecessor.');
    if (state==='M') {i--;k--;} else if (state==='I') i--; else k--;
    state=prev;
  }
  const viterbiPath=reversed.reverse().map((p,index)=>({...p,step:index+1}));
  return {logScore:f.score,viterbiPath,matrixM:f.values.M,matrixI:f.values.I,matrixD:f.values.D,traceM:f.trace.M,traceI:f.trace.I,traceD:f.trace.D,events:f.events};
}
export function runForwardBackward(model:Plan7Model,querySeq:string):ForwardBackwardResult {
  const seq=sequence(model,querySeq),N=seq.length,K=model.K,t=model.transitions;
  const f=forward(model,seq,'sum');
  const matrix=()=>Array.from({length:N+1},()=>Array<number>(K+1).fill(-Infinity));
  const b={M:matrix(),I:matrix(),D:matrix()};
  for(let i=N;i>=0;i--) for(let k=K;k>=0;k--) {
    const nextM=i<N&&k<K?log(model.matchEmissions[k+1][seq[i]])+b.M[i+1][k+1]:-Infinity;
    const nextI=i<N?log(model.insertEmissions[k][seq[i]])+b.I[i+1][k]:-Infinity;
    const nextD=k<K?b.D[i][k+1]:-Infinity;
    for(const state of ['M','I','D'] as const) {
      const end=i===N&&k===K?log(model.endProbabilities[state]):-Infinity;
      b[state][i][k]=logSumExpArray(state==='M'?[end,log(t.MM[k])+nextM,log(t.MI[k])+nextI,log(t.MD[k])+nextD]:
        state==='I'?[end,log(t.IM[k])+nextM,log(t.II[k])+nextI]:
        [end,log(t.DM[k])+nextM,log(t.DD[k])+nextD]);
    }
  }
  const posterior=(state:ProfileState)=>f.values[state].map((row,i)=>row.map((value,k)=>f.score===-Infinity?0:Math.exp(value+b[state][i][k]-f.score)));
  return {logLikelihood:f.score,forwardM:f.values.M,forwardI:f.values.I,forwardD:f.values.D,backwardM:b.M,backwardI:b.I,backwardD:b.D,posteriorM:posterior('M'),posteriorI:posterior('I'),posteriorD:posterior('D'),events:f.events};
}
