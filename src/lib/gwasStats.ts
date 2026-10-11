/** Joint OLS teaching statistics. Reorthogonalized QR avoids sequential
 * covariate projection. Student-t tails use the regularized incomplete beta
 * identity documented by R stats/TDist; no large-N normal switch.
 */
export interface RegressionStats {
  beta:number;se:number;tStat:number;pValue:number;rSquared:number;n:number;
  intercept:number;df:number;rank:number;identifiable:boolean;coefficients:number[];
  residualX:number[];residualY:number[];
}
export const dot=(a:number[],b:number[])=>a.reduce((sum,v,i)=>sum+v*b[i],0);
export const mean=(v:number[])=>v.length?v.reduce((a,b)=>a+b,0)/v.length:0;
export function studentTwoSidedP(t:number,df:number):number {
  if(!Number.isFinite(df)||df<=0||Number.isNaN(t))throw new Error('Valid t and positive finite degrees of freedom are required.');
  if(!Number.isFinite(t))return 1e-300;
  const x=df/(df+t*t);
  return Math.min(1,Math.max(1e-300,incompleteBeta(x,df/2,.5)));
}
export function computeLinearRegression(x:number[],y:number[],covariates:number[][]=[]):RegressionStats {
  const n=x.length;
  if(y.length!==n||covariates.some(c=>c.length!==n)||[x,y,...covariates].some(v=>v.some(a=>!Number.isFinite(a))))throw new Error('Regression vectors must have equal lengths and finite values.');
  const columns=[Array(n).fill(1),...covariates,x];
  const q:number[][]=[],selected:number[]=[],r:number[][]=[];
  let residualX=[...x],residualY=[...y];
  for(let c=0;c<columns.length;c++){
    const residual=[...columns[c]];const projections=Array(q.length).fill(0);
    for(let pass=0;pass<2;pass++)for(let k=0;k<q.length;k++){const projection=dot(residual,q[k]);projections[k]+=projection;for(let i=0;i<n;i++)residual[i]-=projection*q[k][i];}
    if(c===columns.length-1){
      residualX=[...residual];residualY=[...y];
      for(const vector of q){const a=dot(residualY,vector);for(let i=0;i<n;i++)residualY[i]-=a*vector[i];}
    }
    const norm=Math.sqrt(dot(residual,residual)),scale=Math.max(1,Math.sqrt(dot(columns[c],columns[c])));
    for(let k=0;k<q.length;k++)r[k][c]=projections[k];
    if(norm>1e-10*scale){const row=Array(columns.length).fill(0);row[c]=norm;r.push(row);q.push(residual.map(v=>v/norm));selected.push(c);}
  }
  const rank=q.length,df=n-rank,identifiable=selected.includes(columns.length-1)&&df>0;
  const coefficients=Array(columns.length).fill(0);
  const projected=q.map(vector=>dot(y,vector));
  for(let k=rank-1;k>=0;k--){const c=selected[k];let value=projected[k];for(let j=k+1;j<rank;j++)value-=r[k][selected[j]]*coefficients[selected[j]];coefficients[c]=value/r[k][c];}
  const beta=identifiable?coefficients.at(-1)!:0;
  const residual=identifiable?residualY.map((v,i)=>v-beta*residualX[i]):residualY;
  const ssXX=dot(residualX,residualX),ssYY=dot(residualY,residualY);
  const se=identifiable?Math.sqrt(dot(residual,residual)/df/ssXX):Infinity;
  const tStat=identifiable?(se===0?beta===0?0:Math.sign(beta)*Infinity:beta/se):0;
  const pValue=identifiable?studentTwoSidedP(tStat,df):1;
  const rSquared=identifiable&&ssYY>0?Math.max(0,Math.min(1,dot(residualX,residualY)**2/(ssXX*ssYY))):0;
  return{beta,se,tStat,pValue,rSquared,n,intercept:coefficients[0]||0,df,rank,identifiable,coefficients,residualX,residualY};
}
export function dosageR2(a:number[],b:number[]):number {
  if(a.length!==b.length||!a.length)return 0;
  const x=a.map(v=>v-mean(a)),y=b.map(v=>v-mean(b)),xx=dot(x,x),yy=dot(y,y);
  return xx>1e-12&&yy>1e-12?Math.max(0,Math.min(1,dot(x,y)**2/(xx*yy))):0;
}
function incompleteBeta(x: number, a: number, b: number): number {
  if (x === 0) return 0;
  if (x === 1) return 1;
  if (x > (a + 1) / (a + b + 2)) return 1 - incompleteBeta(1 - x, b, a);

  const lbeta = logGamma(a) + logGamma(b) - logGamma(a + b);
  const front = Math.exp(Math.log(x) * a + Math.log1p(-x) * b - lbeta) / a;

  // Continued fraction evaluation
  const maxIt = 300;
  const eps = 1e-12;
  let c = 1.0;
  let d = 1.0 - (a + b) * x / (a + 1.0);
  if (Math.abs(d) < eps) d = eps;
  d = 1.0 / d;
  let h = d;

  for (let m = 1; m <= maxIt; m++) {
    const m2 = 2 * m;
    let num = (m * (b - m) * x) / ((a + m2 - 1.0) * (a + m2));
    d = 1.0 + num * d;
    if (Math.abs(d) < eps) d = eps;
    c = 1.0 + num / c;
    if (Math.abs(c) < eps) c = eps;
    d = 1.0 / d;
    h *= d * c;

    num = -((a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1.0));
    d = 1.0 + num * d;
    if (Math.abs(d) < eps) d = eps;
    c = 1.0 + num / c;
    if (Math.abs(c) < eps) c = eps;
    d = 1.0 / d;
    const del = d * c;
    h *= del;

    if (Math.abs(del - 1.0) < eps) break;
  }
  return Math.min(1.0, Math.max(0.0, front * h));
}

function logGamma(x: number): number {
  const g = 7;
  const p = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  x -= 1;
  let a = p[0];
  const t = x + g + 0.5;
  for (let i = 1; i < p.length; i++) {
    a += p[i] / (x + i);
  }
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}
