import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

type Step = { name?: string; run?: string; uses?: string; 'timeout-minutes'?: number };
type Workflow = {
  on: Record<string, unknown>;
  permissions: Record<string, string>;
  concurrency: { group: string };
  jobs: Record<string, { steps: Step[]; 'timeout-minutes'?: number }>;
};
const workflow = (file: string): Workflow =>
  parse(readFileSync(new URL(`../../.github/workflows/${file}`, import.meta.url), 'utf8'));
const commands = (steps: Step[]) => steps.flatMap((step) => (step.run ? [step.run] : []));

describe('deployment workflow policy', () => {
  it('runs only the production build and basic static audits on push', () => {
    const deploy = workflow('deploy.yml');
    expect(Object.keys(deploy.on).sort()).toEqual(['push', 'workflow_dispatch']);
    expect(deploy.on.push).toEqual({ branches: ['main'] });
    expect(commands(deploy.jobs.build.steps)).toEqual([
      'npm ci',
      'npx playwright install --with-deps --only-shell chromium',
      'npm run build',
      'npm run audit:indexing',
      'npm run audit:links',
      'npm run audit:security',
    ]);
    expect(deploy.jobs.build['timeout-minutes']).toBe(15);
    expect(
      deploy.jobs.build.steps.some((step) => step.uses === 'actions/upload-pages-artifact@v3')
    ).toBe(true);
    expect(deploy.jobs.deploy.steps.some((step) => step.uses === 'actions/deploy-pages@v4')).toBe(
      true
    );
  });
  it('keeps the comprehensive audits manual-only, read-only, and unable to publish Pages', () => {
    const audit = workflow('site-audit.yml');
    expect(Object.keys(audit.on)).toEqual(['workflow_dispatch']);
    expect(audit.permissions).toEqual({ contents: 'read' });
    expect(audit.concurrency.group).not.toBe('pages');
    expect(audit.jobs.audit['timeout-minutes']).toBe(75);
    const steps = audit.jobs.audit.steps;
    expect(commands(steps)).toEqual(
      expect.arrayContaining([
        'npm run check',
        'npm test',
        'npm run build',
        'npm run audit:indexing',
        'npm run test:game-audit-runtime',
        'npm run audit:games:ci',
        'npm run audit:software',
        'npm run audit:terminal:ci',
        'npm run audit:cells:ci',
        'npm run audit:background:ci',
        'npm run audit:motif:ci',
        'npm run audit:playground:ci',
        'npm run audit:genome:ci -- --browsers firefox,webkit',
        'npm run audit:algorithms:ci',
        'npm run audit:refs:offline && npm run audit:datasets:offline',
        'npm run audit:ml-interview',
        'npm run audit:deep-dives:ci',
        'npm run audit:links',
        'npm run audit:security',
      ])
    );
    const buildIndex = steps.findIndex((step) => step.run === 'npm run build');
    expect(steps[buildIndex + 1].run).toBe('npm run audit:indexing');
    expect(Object.keys(audit.jobs)).toEqual(['audit']);
    expect(steps.some((step) => step.uses?.includes('pages'))).toBe(false);
    for (const step of steps.filter(
      (step) => step.run?.includes('audit:') && !step.run.includes('offline')
    )) {
      if (
        step.run?.match(
          /games|software|terminal|cells|background|motif|playground|genome|algorithms|deep-dives/
        )
      ) {
        expect(step['timeout-minutes']).toBeGreaterThan(0);
      }
    }
  });
  it('preserves the full game matrix as a separate manual-only audit', () => {
    const audit = workflow('game-audit.yml');
    expect(Object.keys(audit.on)).toEqual(['workflow_dispatch']);
    expect(audit.permissions).toEqual({ contents: 'read' });
    expect(commands(audit.jobs.audit.steps)).toEqual(
      expect.arrayContaining([
        'npx playwright install --with-deps chromium firefox webkit',
        'npm test',
        'npm run build',
        'npm run audit:indexing',
        'npm run test:game-audit-runtime',
        'npm run audit:games',
        'npm run audit:games:ci',
      ])
    );
    expect(audit.jobs.audit.steps.some((step) => step.uses?.includes('pages'))).toBe(false);
  });
});
