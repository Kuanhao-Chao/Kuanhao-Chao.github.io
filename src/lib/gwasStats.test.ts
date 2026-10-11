import {describe,it,expect} from 'vitest';
import {computeLinearRegression,studentTwoSidedP} from './gwasStats';
describe('Joint regression and Student-t tails',()=>{
  it('matches closed-form Cauchy and two-degree-of-freedom tails',()=>{
    expect(studentTwoSidedP(1,1)).toBeCloseTo(.5,12);
    expect(studentTwoSidedP(Math.sqrt(2),2)).toBeCloseTo(1-1/Math.sqrt(2),12);
    expect(studentTwoSidedP(0,80)).toBe(1);
    expect(studentTwoSidedP(40,1000)).toBeGreaterThan(0);
  });
  it('reports rank and non-identifiable variants rather than fabricating significance',()=>{
    const result=computeLinearRegression([0,1,2,0,1,2],[1,2,4,3,3,4],[[1,2,3,1,2,3]]);
    expect(result.identifiable).toBe(false);
    expect(result.rank).toBe(2);
    expect(result.pValue).toBe(1);
    expect(()=>computeLinearRegression([1,2,3],[1,2])).toThrow();
  });
  it('uses actual rank for degrees of freedom and recovers the full intercept',()=>{
    const x=[0,1,2,0,1,2,0,1,2,1],z=[1,2,3,4,5,6,7,8,9,10];
    const y=x.map((v,i)=>5+1.7*v+2*z[i]);
    const r=computeLinearRegression(x,y,[z,z.map(v=>2*v)]);
    expect(r.intercept).toBeCloseTo(5,10);
    expect(r.beta).toBeCloseTo(1.7,10);
    expect(r.df).toBe(7);
  });
});
