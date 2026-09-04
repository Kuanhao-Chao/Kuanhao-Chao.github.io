#!/usr/bin/env node

/**
 * End-to-End Playwright Verification Test Suite for Mamba & State Space Model Interactive Laboratory
 *
 * Validates:
 * 1. 4 Responsive Viewports (Desktop 1280x800, Tablet 768x1024, Mobile 375x667, Small Mobile 320x568)
 * 2. Zero Horizontal Overflow across all viewports:
 *    document.documentElement.scrollWidth <= document.documentElement.clientWidth
 * 3. Interactive User Flows:
 *    - Token list, state vector heatmap, and step badge are rendered
 *    - Step forward navigation ([data-mamba-next]) advances active step
 *    - Preset switching ([data-mamba-preset="dnaDistal"]) updates tokens and selective scan
 *    - Token badge click displays mathematical X-Ray arithmetic breakdown
 *    - Mode switching between Recurrent ([data-mamba-mode-tab="recurrent"]) and Parallel Scan ([data-mamba-mode-tab="parallel"])
 *    - ZOH slider and benchmark slider interactions update live mathematical visualizations
 *    - PyTorch snippet contains selective_scan / MambaBlock and copy button works
 * 4. High-resolution visual screenshots saved to scratch directory:
 *    - Desktop: mamba_studio_desktop_1280.png
 *    - Mobile: mamba_studio_mobile_375.png
 * 5. Zero browser console errors.
 */

import { chromium } from 'playwright';
import { dev, preview } from 'astro';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const SCRATCH_DIR =
  process.env.SCRATCH_DIR ||
  (fs.existsSync('/Users/chaokuan-hao/.gemini/antigravity-cli/brain/7f11aa1c-5b3b-44de-bfd9-1ce4fbc93a1c/scratch')
    ? '/Users/chaokuan-hao/.gemini/antigravity-cli/brain/7f11aa1c-5b3b-44de-bfd9-1ce4fbc93a1c/scratch'
    : path.join(ROOT, '.scratch'));

const VIEWPORTS = [
  { name: 'Desktop', width: 1280, height: 800 },
  { name: 'Tablet', width: 768, height: 1024 },
  { name: 'Mobile', width: 375, height: 667 },
  { name: 'Small Mobile', width: 320, height: 568 },
];

async function probeUrl(url, timeoutMs = 2000) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { method: 'HEAD', signal: controller.signal });
    clearTimeout(timeout);
    return res.ok || res.status === 200 || res.status === 304;
  } catch {
    return false;
  }
}

async function resolveServer() {
  // Check if active Astro dev server is already running on port 4321
  if (await probeUrl('http://localhost:4321/nn-lab/mamba/')) {
    console.log('✓ Found active Astro server at http://localhost:4321');
    return { baseUrl: 'http://localhost:4321', close: async () => {} };
  }

  // Check if server is running on port 4339
  if (await probeUrl('http://localhost:4339/nn-lab/mamba/')) {
    console.log('✓ Found active server at http://localhost:4339');
    return { baseUrl: 'http://localhost:4339', close: async () => {} };
  }

  // Otherwise launch preview server from dist/ if built
  const distHtml = path.join(ROOT, 'dist', 'nn-lab', 'mamba', 'index.html');
  if (fs.existsSync(distHtml)) {
    console.log('Starting Astro preview server on port 4347 from dist/...');
    const previewServer = await preview({
      root: ROOT,
      server: { port: 4347 },
    });
    return {
      baseUrl: 'http://localhost:4347',
      close: async () => {
        await previewServer.stop();
      },
    };
  }

  // Fallback: spin up dev server
  console.log('Starting Astro dev server on port 4347...');
  const devServer = await dev({
    root: ROOT,
    server: { port: 4347 },
  });
  return {
    baseUrl: 'http://localhost:4347',
    close: async () => {
      await devServer.stop();
    },
  };
}

async function runAudit() {
  console.log('===============================================================');
  console.log('🐍 MAMBA & STATE SPACE MODEL (SSM) LAB AUDIT & VERIFICATION');
  console.log('===============================================================');

  fs.mkdirSync(SCRATCH_DIR, { recursive: true });

  const { baseUrl, close: closeServer } = await resolveServer();
  const labUrl = `${baseUrl}/nn-lab/mamba/`;

  const browser = await chromium.launch();
  const context = await browser.newContext();
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  const failures = [];
  const pass = (desc) => console.log(`  ✓ ${desc}`);
  const fail = (desc, detail) => {
    console.error(`  ✗ FAIL: ${desc} — ${detail}`);
    failures.push(`${desc}: ${detail}`);
  };

  try {
    // -------------------------------------------------------------------------
    // Phase 1: Viewport Responsiveness & Zero Horizontal Overflow
    // -------------------------------------------------------------------------
    console.log('\n--- Phase 1: Viewport Responsiveness & Zero Horizontal Overflow ---');
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(labUrl, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-mamba-studio-ready="true"]', { timeout: 8000 });

      // Wait a moment for layout settlement
      await page.waitForTimeout(200);

      const overflow = await page.evaluate(() => {
        const docEl = document.documentElement;
        const body = document.body;
        const scrollWidth = Math.max(docEl.scrollWidth, body.scrollWidth);
        const clientWidth = docEl.clientWidth;
        const hasOverflow = scrollWidth > clientWidth + 1; // 1px subpixel tolerance

        const overflowingElements = [];
        if (hasOverflow) {
          const all = document.querySelectorAll('*');
          for (const el of all) {
            const r = el.getBoundingClientRect();
            if (r.right > clientWidth + 2) {
              overflowingElements.push({
                tag: el.tagName.toLowerCase(),
                className: el.className,
                id: el.id,
                right: Math.round(r.right),
                width: Math.round(r.width),
                textSnippet: el.textContent?.slice(0, 30)?.trim(),
              });
              if (overflowingElements.length >= 5) break;
            }
          }
        }

        return {
          scrollWidth,
          clientWidth,
          hasOverflow,
          diff: scrollWidth - clientWidth,
          overflowingElements,
        };
      });

      if (!overflow.hasOverflow) {
        pass(
          `${vp.name} (${vp.width}x${vp.height}): Zero horizontal overflow (scrollWidth=${overflow.scrollWidth} <= clientWidth=${overflow.clientWidth})`
        );
      } else {
        fail(
          `${vp.name} (${vp.width}x${vp.height}) horizontal overflow`,
          `scrollWidth (${overflow.scrollWidth}) exceeds clientWidth (${overflow.clientWidth}) by ${overflow.diff}px; bad elements: ${JSON.stringify(overflow.overflowingElements)}`
        );
      }
    }

    // -------------------------------------------------------------------------
    // Phase 2: Interactive User Flows (Desktop 1280x800)
    // -------------------------------------------------------------------------
    console.log('\n--- Phase 2: Interactive User Flows (Desktop 1280x800) ---');
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(labUrl, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-mamba-studio-ready="true"]', { timeout: 8000 });

    // 1. Verify token badges, state vector heatmap, and step badge are rendered
    const tokenBadgeCount = await page.locator('[data-mamba-token-list] .token-badge').count();
    const stateCellCount = await page.locator('[data-mamba-state-vector] .state-cell').count();
    const stepBadgeText = (await page.locator('[data-mamba-step-badge]').textContent())?.trim() ?? '';

    if (tokenBadgeCount === 10 && stateCellCount === 8 && stepBadgeText.includes('Step 1')) {
      pass(
        `Initial rendering verified: ${tokenBadgeCount} token badges, ${stateCellCount} state vector cells, step badge="${stepBadgeText}"`
      );
    } else {
      fail(
        'Initial rendering check',
        `Expected 10 tokens, 8 state cells, Step 1 badge. Got: tokens=${tokenBadgeCount}, cells=${stateCellCount}, badge="${stepBadgeText}"`
      );
    }

    // 2. Click step forward ([data-mamba-next]) and verify active step advances
    await page.click('[data-mamba-next]');
    await page.waitForTimeout(150);
    const updatedStepBadgeText = (await page.locator('[data-mamba-step-badge]').textContent())?.trim() ?? '';

    if (updatedStepBadgeText.includes('Step 2')) {
      pass(`Step forward navigation: Step advanced from "${stepBadgeText}" → "${updatedStepBadgeText}"`);
    } else {
      fail('Step forward navigation', `Expected step 2, got "${updatedStepBadgeText}"`);
    }

    // 3. Click preset button (dnaDistal) and verify tokens and selective scan update
    await page.click('[data-mamba-preset="dnaDistal"]');
    await page.waitForTimeout(200);

    const distalTokens = await page
      .locator('[data-mamba-token-list] .token-badge .token-str')
      .allInnerTexts();
    const isDistalActive = await page
      .locator('[data-mamba-preset="dnaDistal"]')
      .evaluate((el) => el.classList.contains('active') || el.getAttribute('aria-pressed') === 'true');
    const resetStepBadgeText = (await page.locator('[data-mamba-step-badge]').textContent())?.trim() ?? '';

    if (
      isDistalActive &&
      distalTokens.length > 0 &&
      distalTokens.some((t) => t.includes('Enhancer') || t.includes('Promoter') || t.includes('TSS')) &&
      resetStepBadgeText.includes('Step 1')
    ) {
      pass(
        `Preset switching (dnaDistal): Active=${isDistalActive}, tokens=[${distalTokens.join(', ')}], step reset="${resetStepBadgeText}"`
      );
    } else {
      fail(
        'Preset switching (dnaDistal)',
        `Active=${isDistalActive}, tokens=${JSON.stringify(distalTokens)}, badge="${resetStepBadgeText}"`
      );
    }

    // 4. Click a token badge and verify X-Ray drawer displays mathematical breakdown
    const thirdToken = page.locator('[data-mamba-token-list] .token-badge').nth(2);
    await thirdToken.click();
    await page.waitForTimeout(200);

    const xrayText = (await page.locator('[data-mamba-xray]').textContent()) ?? '';
    const xrayHasTitle = xrayText.includes('X-Ray State Space Arithmetic');
    const xrayHasZOH = xrayText.includes('ZOH Discretization');
    const xrayHasRecurrence = xrayText.includes('Recurrence State Evolution');
    const isTokenSelected = await thirdToken.evaluate((el) => el.classList.contains('active'));

    if (xrayHasTitle && xrayHasZOH && xrayHasRecurrence && isTokenSelected) {
      pass(
        `Mathematical X-Ray inspection: Token 2 selected (active=${isTokenSelected}), drawer displays exact ZOH and recurrence arithmetic breakdown`
      );
    } else {
      fail(
        'Mathematical X-Ray inspection',
        `title=${xrayHasTitle}, zoh=${xrayHasZOH}, recurrence=${xrayHasRecurrence}, selected=${isTokenSelected}`
      );
    }

    // 5. Switch between Recurrent and Parallel Scan modes
    // Click parallel tab
    await page.click('[data-mamba-mode-tab="parallel"]');
    await page.waitForTimeout(200);

    const parallelPanelVisible = await page.locator('[data-mamba-panel="parallel"]').isVisible();
    const recurrentPanelVisibleWhenParallel = await page.locator('[data-mamba-panel="recurrent"]').isVisible();
    const treeNodeCount = await page.locator('[data-mamba-tree-diagram] .tree-node').count();
    const assocMathText = (await page.locator('[data-mamba-assoc-math]').textContent()) ?? '';
    const hasBlellochMath = assocMathText.includes('Blelloch Parallel Associative Prefix Scan');

    if (parallelPanelVisible && !recurrentPanelVisibleWhenParallel && treeNodeCount > 0 && hasBlellochMath) {
      pass(
        `Parallel Scan mode switch: parallel panel visible=${parallelPanelVisible}, recurrent panel hidden=${!recurrentPanelVisibleWhenParallel}, Blelloch tree rendered with ${treeNodeCount} nodes`
      );
    } else {
      fail(
        'Parallel Scan mode switch',
        `parallelVisible=${parallelPanelVisible}, recurrentVisible=${recurrentPanelVisibleWhenParallel}, treeNodes=${treeNodeCount}, blelloch=${hasBlellochMath}`
      );
    }

    // Switch back to recurrent mode
    await page.click('[data-mamba-mode-tab="recurrent"]');
    await page.waitForTimeout(200);
    const recurrentPanelRestored = await page.locator('[data-mamba-panel="recurrent"]').isVisible();
    const parallelPanelHidden = !(await page.locator('[data-mamba-panel="parallel"]').isVisible());

    if (recurrentPanelRestored && parallelPanelHidden) {
      pass('Recurrent inference mode restored smoothly');
    } else {
      fail('Restore recurrent mode', `recurrentRestored=${recurrentPanelRestored}, parallelHidden=${parallelPanelHidden}`);
    }

    // 6. Interact with ZOH slider and benchmark slider
    // ZOH Slider: change delta to 0.75
    await page.evaluate(() => {
      const slider = document.querySelector('[data-mamba-delta-slider]');
      if (slider) {
        slider.value = '0.75';
        slider.dispatchEvent(new Event('input', { bubbles: true }));
        slider.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await page.waitForTimeout(150);

    const zohValText = (await page.locator('[data-mamba-delta-val]').textContent())?.trim() ?? '';
    const matrixItemCount = await page.locator('[data-mamba-a-bar-matrix] .a-bar-card').count();

    if (zohValText === '0.75' && matrixItemCount > 0) {
      pass(`ZOH Discretization slider: value updated to "${zohValText}", discretized matrix re-rendered with ${matrixItemCount} items`);
    } else {
      fail('ZOH Discretization slider', `val="${zohValText}", matrixItems=${matrixItemCount}`);
    }

    // Benchmark Slider: change context length to 65536
    await page.evaluate(() => {
      const slider = document.querySelector('[data-mamba-benchmark-slider]');
      if (slider) {
        slider.value = '65536';
        slider.dispatchEvent(new Event('input', { bubbles: true }));
        slider.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await page.waitForTimeout(150);

    const benchValText = (await page.locator('[data-mamba-benchmark-val]').textContent())?.trim() ?? '';
    const benchReadoutText = (await page.locator('[data-mamba-benchmark-readout]').textContent()) ?? '';
    const benchChartVisible = await page.locator('[data-mamba-kv-vs-ssm-chart]').isVisible();

    if (benchValText.includes('65,536') && (benchReadoutText.includes('Advantage') || benchReadoutText.includes('Mamba SSM State')) && benchChartVisible) {
      pass(
        `Context benchmark slider: value updated to "${benchValText}", live memory ratio calculated and chart visible`
      );
    } else {
      fail('Benchmark slider', `val="${benchValText}", readout="${benchReadoutText.slice(0, 50)}", chart=${benchChartVisible}`);
    }

    // 7. Verify PyTorch snippet contains SelectiveScan / MambaBlock and copy button works
    const pytorchCode = (await page.locator('[data-mamba-pytorch-code]').textContent()) ?? '';
    const hasSelectiveScan = pytorchCode.includes('selective_scan') || pytorchCode.includes('Selective Scan');
    const hasMambaBlock = pytorchCode.includes('MambaBlock');

    await page.click('[data-mamba-copy-pytorch]');
    await page.waitForTimeout(150);
    const copyBtnText = (await page.locator('[data-mamba-copy-pytorch]').textContent()) ?? '';
    const copySucceeded = copyBtnText.includes('Copied') || copyBtnText.includes('✓');

    if (hasSelectiveScan && hasMambaBlock && copySucceeded) {
      pass(
        `PyTorch code generation & copy: snippet contains 'selective_scan' and 'MambaBlock', copy button confirmed '${copyBtnText.trim()}'`
      );
    } else {
      fail(
        'PyTorch code & copy button',
        `hasSelectiveScan=${hasSelectiveScan}, hasMambaBlock=${hasMambaBlock}, copySucceeded=${copySucceeded} (text="${copyBtnText.trim()}")`
      );
    }

    // -------------------------------------------------------------------------
    // Phase 3: Visual Screenshot Capture
    // -------------------------------------------------------------------------
    console.log('\n--- Phase 3: Visual Screenshot Capture ---');

    // Reset back to desktop default layout for clean capture
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.click('[data-mamba-preset="nlpFilter"]');
    await page.waitForTimeout(200);

    const shotDesktopPath = path.join(SCRATCH_DIR, 'mamba_studio_desktop_1280.png');
    await page.screenshot({ path: shotDesktopPath, fullPage: false });
    pass(`Saved desktop screenshot to ${shotDesktopPath}`);

    // Mobile Viewport 375x667
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(200);
    const shotMobilePath = path.join(SCRATCH_DIR, 'mamba_studio_mobile_375.png');
    await page.screenshot({ path: shotMobilePath, fullPage: false });
    pass(`Saved mobile screenshot to ${shotMobilePath}`);

    // -------------------------------------------------------------------------
    // Phase 4: Browser Console Errors Check
    // -------------------------------------------------------------------------
    if (consoleErrors.length > 0) {
      fail('Browser console errors detected', consoleErrors.join(' | '));
    } else {
      pass('Zero browser console errors detected throughout audit');
    }
  } finally {
    await browser.close();
    await closeServer();
  }

  console.log('\n===============================================================');
  if (failures.length === 0) {
    console.log('🎉 ALL MAMBA & STATE SPACE MODEL (SSM) LAB AUDIT CHECKS PASSED CLEANLY!');
    console.log('===============================================================');
  } else {
    console.error(`❌ AUDIT FAILED WITH ${failures.length} ISSUE(S):`);
    failures.forEach((f) => console.error(`  - ${f}`));
    console.log('===============================================================');
    process.exit(1);
  }
}

runAudit().catch((err) => {
  console.error('Fatal audit error:', err);
  process.exit(1);
});
