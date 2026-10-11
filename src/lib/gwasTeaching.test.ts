import {describe,it,expect} from 'vitest';
import {simulateTeachingGWAS} from './gwasTeaching';
import {computeLinearRegression,dot} from './gwasStats';
describe('Cohort-derived educational GWAS',()=>{
  it('reproduces the complete cohort and statistics for a fixed seed',()=>{
    const a=simulateTeachingGWAS({seed:42,n:80,scenario:'causal',adjustment:2,lead:6});
    expect(a).toEqual(simulateTeachingGWAS({seed:42,n:80,scenario:'causal',adjustment:2,lead:6}));
    expect(a.cohort).not.toEqual(simulateTeachingGWAS({seed:43,n:80,scenario:'causal',adjustment:2,lead:6}).cohort);
  });
  it('fits every displayed variant from the actual cohort and genotype PCs',()=>{
    const r=simulateTeachingGWAS({seed:42,n:80,scenario:'causal',adjustment:2,lead:6});
    const y=r.cohort.map(i=>i.phenotype);
    for (const variant of r.variants){
      const fit=computeLinearRegression(r.cohort.map(i=>i.genotypes[variant.index]),y,r.pcs);
      expect(variant.fit).toEqual(fit);
      expect(variant.negLog10P).toBe(-Math.log10(fit.pValue));
    }
    expect(dot(r.pcs[0],r.pcs[1])).toBeCloseTo(0,8);
  });
  it('recomputes measured LD when the lead changes without changing associations',()=>{
    const a=simulateTeachingGWAS({seed:42,n:80,scenario:'causal',adjustment:0,lead:1});
    const b=simulateTeachingGWAS({seed:42,n:80,scenario:'causal',adjustment:0,lead:6});
    expect(a.variants.map(v=>v.fit)).toEqual(b.variants.map(v=>v.fit));
    expect(a.variants[0].ld).toBeCloseTo(1,12);
    expect(b.variants[5].ld).toBeCloseTo(1,12);
    expect(a.variants.map(v=>v.ld)).not.toEqual(b.variants.map(v=>v.ld));
  });
  it('uses independent prediction test samples and never changes weights using test outcomes',()=>{
    const r=simulateTeachingGWAS({seed:17,n:80,scenario:'causal',adjustment:2,lead:6});
    expect(r.validation).toHaveLength(80);
    expect(r.validation).not.toEqual(r.cohort);
    expect(r.prs.weights.length).toBe(8);
    expect(r.prs.test.n).toBe(80);
    expect(r.qq).toHaveLength(32);
    expect(()=>simulateTeachingGWAS({seed:1,n:2,scenario:'causal',adjustment:0,lead:1})).toThrow();
  });
});
