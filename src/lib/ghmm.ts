/** Restricted, forward-strand, one-complete-gene semi-Markov teaching scorer.
 * Normalized duration/transition terms plus handcrafted rewards: not a
 * calibrated sequence likelihood or production GENSCAN/AUGUSTUS predictor.
 */
export type GhmmStateType='Intergenic'|'Exon_Init'|'Intron'|'Exon_Int'|'Exon_Term'|'Exon_Single';
export interface GeneFeature {
  id:string;type:'exon'|'intron'|'intergenic';subType:GhmmStateType;
  start:number;end:number;length:number;sequence:string;score:number;readingFrame?:number;
}
export interface GeneCandidate {
  start:number;end:number;state:GhmmStateType;previous:string;key:string;
  pendingBefore:string;pendingAfter:string;durationScore:number;transitionScore:number;
  sensorScore:number;total:number;valid:boolean;selected:boolean;reason:string;
}
export interface GhmmResult {
  sequence:string;features:GeneFeature[];cdsSequence:string;proteinTranslation:string;
  totalScore:number;exonCount:number;intronCount:number;
  candidates:GeneCandidate[];durationLimit:number;
  stats:{gcPercent:number;totalLen:number;codingLen:number};
}
export const CODON_TABLE: Record<string, string> = {
  ATA: 'I', ATC: 'I', ATT: 'I', ATG: 'M',
  ACA: 'T', ACC: 'T', ACG: 'T', ACT: 'T',
  AAC: 'N', AAT: 'N', AAA: 'K', AAG: 'K',
  AGC: 'S', AGT: 'S', AGA: 'R', AGG: 'R',
  CTA: 'L', CTC: 'L', CTG: 'L', CTT: 'L',
  CCA: 'P', CCC: 'P', CCG: 'P', CCT: 'P',
  CAC: 'H', CAT: 'H', CAA: 'Q', CAG: 'Q',
  CGA: 'R', CGC: 'R', CGG: 'R', CGT: 'R',
  GTA: 'V', GTC: 'V', GTG: 'V', GTT: 'V',
  GCA: 'A', GCC: 'A', GCG: 'A', GCT: 'A',
  GAC: 'D', GAT: 'D', GAA: 'E', GAG: 'E',
  GGA: 'G', GGC: 'G', GGG: 'G', GGT: 'G',
  TCA: 'S', TCC: 'S', TCG: 'S', TCT: 'S',
  TTC: 'F', TTT: 'F', TTA: 'L', TTG: 'L',
  TAC: 'Y', TAT: 'Y', TAA: '*', TAG: '*',
  TGC: 'C', TGT: 'C', TGA: '*', TGG: 'W',
};

export const STOP_CODONS = new Set(['TAA', 'TAG', 'TGA']);


export function translateDnaToProtein(cds:string):string {
  const seq=cds.trim().toUpperCase(); let protein='';
  if(!/^[ACGT]*$/.test(seq)) throw new Error('Translation accepts ACGT only.');
  for(let i=0;i+2<seq.length;i+=3){const aa=CODON_TABLE[seq.slice(i,i+3)];if(aa==='*')break;protein+=aa;}
  return protein;
}
const minDuration:Record<GhmmStateType,number>={Intergenic:1,Exon_Init:3,Intron:8,Exon_Int:1,Exon_Term:1,Exon_Single:6};
const durationCache=new Map<string,number[]>();
export function evaluateDurationScore(state:GhmmStateType,d:number,max=36):number {
  if(state==='Intergenic')return d===1?0:-Infinity;
  if(!Number.isInteger(d)||d<minDuration[state]||d>max)return -Infinity;
  const key=state+':'+max;
  if(!durationCache.has(key)){
    const mu=state==='Intron'?14:15,sigma=state==='Intron'?8:6;
    const weights=Array.from({length:max+1},(_,i)=>i>=minDuration[state]?Math.exp(-.5*((i-mu)/sigma)**2):0);
    const z=weights.reduce((a,b)=>a+b,0);
    durationCache.set(key,weights.map(w=>w?Math.log(w/z):-Infinity));
  }
  return durationCache.get(key)![d];
}
function appendCoding(pending:string,sub:string,terminal:boolean):{valid:boolean;pending:string;reason:string} {
  let carry=pending;
  for(let i=0;i<sub.length;i++){
    carry+=sub[i];
    if(carry.length===3){
      if(STOP_CODONS.has(carry)){
        if(!terminal||i!==sub.length-1)return{valid:false,pending:carry,reason:'Premature in-frame stop, including codons spanning a splice junction.'};
        return{valid:true,pending:'',reason:'Complete terminal stop in frame.'};
      }
      carry='';
    }
  }
  return terminal?{valid:false,pending:carry,reason:'No terminal stop completing the inherited reading frame.'}:{valid:true,pending:carry,reason:'Coding continuation; retain partial-codon bases.'};
}
export function scoreSegmentEmission(seq:string,startIdx:number,len:number,state:GhmmStateType):{score:number;isValid:boolean} {
  const sub=seq.slice(startIdx,startIdx+len);
  if(sub.length!==len)return{score:-Infinity,isValid:false};
  if(state==='Intergenic')return{score:0,isValid:true};
  if(state==='Intron')return{score:6,isValid:len>=8&&sub.startsWith('GT')&&sub.endsWith('AG')};
  const initial=state==='Exon_Init'||state==='Exon_Single';
  const terminal=state==='Exon_Term'||state==='Exon_Single';
  const valid=(!initial||sub.startsWith('ATG'))&&appendCoding('',sub,terminal).valid;
  return{score:.8*len+(initial?3:0)+(terminal?3:0),isValid:valid};
}
export const STATE_TRANSITIONS:Record<GhmmStateType,{next:GhmmStateType;logProb:number}[]>={
  Intergenic:[{next:'Intergenic',logProb:Math.log(.98)},{next:'Exon_Init',logProb:Math.log(.01)},{next:'Exon_Single',logProb:Math.log(.01)}],
  Exon_Init:[{next:'Intron',logProb:0}],Intron:[{next:'Exon_Int',logProb:Math.log(.5)},{next:'Exon_Term',logProb:Math.log(.5)}],
  Exon_Int:[{next:'Intron',logProb:0}],Exon_Term:[{next:'Intergenic',logProb:0}],Exon_Single:[{next:'Intergenic',logProb:0}],
};
interface Entry {score:number;pos:number;key:string;pending:string;previous?:Entry;feature?:GeneFeature}
export function runGhmmGeneFinder(dnaInput:string,durationLimit=36):GhmmResult {
  const seq=dnaInput.trim().toUpperCase(),N=seq.length;
  if(!/^[ACGT]*$/.test(seq))throw new Error('DNA must contain ACGT only; no characters were stripped.');
  if(N>160)throw new Error('Teaching limit: 160 bases.');
  if(!Number.isInteger(durationLimit)||durationLimit<8||durationLimit>80)throw new Error('Duration limit must be an integer from 8 to 80.');
  const cells=Array.from({length:N+1},()=>new Map<string,Entry>());
  cells[0].set('Before',{score:0,pos:0,key:'Before',pending:''});
  const candidates:GeneCandidate[]=[];
  const put=(entry:Entry)=>{const current=cells[entry.pos].get(entry.key);if(!current||entry.score>current.score){cells[entry.pos].set(entry.key,entry);return true;}return false;};
  for(let start=0;start<N;start++)for(const previous of cells[start].values()){
    const before=previous.key==='Before',after=previous.key==='After',exon=previous.key.startsWith('Exon:'),intron=previous.key.startsWith('Intron:');
    if(before||after){
      const local=before?Math.log(.98):0;
      put({score:previous.score+local,pos:start+1,key:previous.key,pending:'',previous,
        feature:{id:'',type:'intergenic',subType:'Intergenic',start:start+1,end:start+1,length:1,sequence:seq[start],score:local}});
      if(after)continue;
    }
    const nextStates:GhmmStateType[]=before?['Exon_Init','Exon_Single']:exon?['Intron']:intron?['Exon_Int','Exon_Term']:[];
    for(const state of nextStates)for(let d=minDuration[state];d<=Math.min(durationLimit,N-start);d++){
      const sub=seq.slice(start,start+d),isIntron=state==='Intron',initial=state==='Exon_Init'||state==='Exon_Single',terminal=state==='Exon_Term'||state==='Exon_Single';
      const check=isIntron?{valid:sub.startsWith('GT')&&sub.endsWith('AG'),pending:previous.pending,reason:'Intron must include both GT donor and AG acceptor.'}:
        initial&&!sub.startsWith('ATG')?{valid:false,pending:'',reason:'Initial coding segment must start with ATG.'}:appendCoding(previous.pending,sub,terminal);
      const key=isIntron?'Intron:'+check.pending:terminal?'After':'Exon:'+check.pending;
      const durationScore=evaluateDurationScore(state,d,durationLimit);
      const transitionScore=before?Math.log(.01):intron?Math.log(.5):0;
      const sensorScore=isIntron?6:.8*d+(initial?3:0)+(terminal?3:0);
      const total=check.valid?previous.score+durationScore+transitionScore+sensorScore:-Infinity;
      const candidate:GeneCandidate={start,end:start+d,state,previous:previous.key,key,pendingBefore:previous.pending,pendingAfter:check.pending,durationScore,transitionScore,sensorScore,total,valid:check.valid,selected:false,reason:check.reason};
      if(check.valid)candidate.selected=put({score:total,pos:start+d,key,pending:check.pending,previous,feature:{id:'',type:isIntron?'intron':'exon',subType:state,start:start+1,end:start+d,length:d,sequence:sub,score:durationScore+transitionScore+sensorScore,readingFrame:previous.pending.length}});
      candidates.push(candidate);
    }
  }
  // Exon/Intron states are never legal final states: a gene must have stopped.
  const noGene=cells[N].get('Before')!;
  const complete=cells[N].get('After');
  let entry=complete&&complete.score>noGene.score?complete:noGene;
  const totalScore=entry.score;const reverse:GeneFeature[]=[];
  while(entry.previous){reverse.push(entry.feature!);entry=entry.previous;}
  const raw=reverse.reverse();const features:GeneFeature[]=[];
  for(const f of raw){const last=features.at(-1);if(f.type==='intergenic'&&last?.type==='intergenic'){last.end=f.end;last.length++;last.sequence+=f.sequence;last.score+=f.score;}else features.push({...f});}
  features.forEach((f,i)=>f.id='feature_'+(i+1));
  const cdsSequence=features.filter(f=>f.type==='exon').map(f=>f.sequence).join('');
  return{sequence:seq,features,cdsSequence,proteinTranslation:translateDnaToProtein(cdsSequence),totalScore,
    exonCount:features.filter(f=>f.type==='exon').length,intronCount:features.filter(f=>f.type==='intron').length,candidates,durationLimit,
    stats:{gcPercent:N?[...seq].filter(c=>'GC'.includes(c)).length/N*100:0,totalLen:N,codingLen:cdsSequence.length}};
}
