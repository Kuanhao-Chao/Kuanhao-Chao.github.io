#!/usr/bin/env node

/**
 * End-to-End Playwright Verification Test Suite for CNN Interactive Laboratory
 *
 * Validates:
 * 1. 4 Responsive Viewports (Desktop 1280x800, Tablet 768x1024, Mobile 375x667, Small Mobile 320x568)
 * 2. Zero Horizontal Overflow across all viewports:
 *    document.documentElement.scrollWidth <= document.documentElement.clientWidth
 * 3. Interactive User Flows:
 *    - 2D Input, Kernel, and Output feature map cell rendering
 *    - Step navigation forward ([data-cnn-step-next]) advances active step counter
 *    - Kernel preset switching ([data-cnn-preset-kernel="laplacian"]) updates weights
 *    - 1D Sequence mode tab ([data-cnn-tab="1d"]) renders sequence track & score chart bars
 *    - 2D Vision mode tab ([data-cnn-tab="2d"]) returns to 2D panel
 *    - Receptive field ladder expansion ([data-cnn-rf-add-layer])
 *    - PyTorch module generator contains `nn.Conv2d` and copy button functionality
 * 4. High-resolution UI screenshots captured and saved to scratch directory.
 */

import { chromium } from 'playwright';
import { preview } from 'astro';
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
  // Check if active dev server is on port 4321
  if (await probeUrl('http://localhost:4321/nn-lab/')) {
    console.log('✓ Found active Astro dev server at http://localhost:4321');
    return { baseUrl: 'http://localhost:4321', close: async () => {} };
  }

  // Check if active preview or dev server is on port 4339
  if (await probeUrl('http://localhost:4339/nn-lab/')) {
    console.log('✓ Found active server at http://localhost:4339');
    return { baseUrl: 'http://localhost:4339', close: async () => {} };
  }

  // Otherwise launch preview server from dist/
  const distDir = path.join(ROOT, 'dist');
  if (fs.existsSync(distDir)) {
    console.log('Starting Astro preview server on port 4342 from dist/...');
    const previewServer = await preview({
      root: ROOT,
      server: { port: 4342 },
    });
    return {
      baseUrl: 'http://localhost:4342',
      close: async () => {
        await previewServer.stop();
      },
    };
  }

  throw new Error('No running server found on port 4321/4339 and dist/ directory does not exist. Run npm run build or npm run dev first.');
}

async function runAudit() {
  console.log('===============================================================');
  console.log('🚀 CNN INTERACTIVE LABORATORY AUDIT & VERIFICATION SUITE');
  console.log('===============================================================');

  fs.mkdirSync(SCRATCH_DIR, { recursive: true });

  const { baseUrl, close: closeServer } = await resolveServer();
  const labUrl = `${baseUrl}/nn-lab/`;

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
    // Phase 1: Zero Horizontal Overflow Across All 4 Viewports
    // -------------------------------------------------------------------------
    console.log('\n--- Phase 1: Viewport Responsiveness & Zero Horizontal Overflow ---');
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(labUrl, { waitUntil: 'networkidle' });

      // Wait a moment for layout settlement
      await page.waitForTimeout(200);

      const overflow = await page.evaluate(() => {
        const docEl = document.documentElement;
        const body = document.body;
        const scrollWidth = Math.max(docEl.scrollWidth, body.scrollWidth);
        const clientWidth = docEl.clientWidth;
        return {
          scrollWidth,
          clientWidth,
          hasOverflow: scrollWidth > clientWidth,
          diff: scrollWidth - clientWidth,
        };
      });

      if (!overflow.hasOverflow) {
        pass(`${vp.name} (${vp.width}x${vp.height}): Zero horizontal overflow (scrollWidth=${overflow.scrollWidth} <= clientWidth=${overflow.clientWidth})`);
      } else {
        fail(
          `${vp.name} (${vp.width}x${vp.height}) horizontal overflow`,
          `scrollWidth (${overflow.scrollWidth}) exceeds clientWidth (${overflow.clientWidth}) by ${overflow.diff}px`
        );
      }
    }

    // -------------------------------------------------------------------------
    // Phase 2: Interactive User Flows (Desktop 1280x800)
    // -------------------------------------------------------------------------
    console.log('\n--- Phase 2: Interactive User Flows (Desktop 1280x800) ---');
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(labUrl, { waitUntil: 'networkidle' });

    // 1. Grid Rendering
    const inputCellCount = await page.locator('[data-cnn-input-grid] .cnn-cell').count();
    const kernelCellCount = await page.locator('[data-cnn-kernel-grid] .cnn-cell').count();
    const outputCellCount = await page.locator('[data-cnn-output-grid] .cnn-cell').count();

    if (inputCellCount > 0 && kernelCellCount === 9 && outputCellCount > 0) {
      pass(`2D Grids rendered: Input=${inputCellCount} cells, Kernel=${kernelCellCount} cells, Output=${outputCellCount} cells`);
    } else {
      fail('2D Grids rendering', `Expected cells rendered, got Input=${inputCellCount}, Kernel=${kernelCellCount}, Output=${outputCellCount}`);
    }

    // 2. Step Forward Execution
    const stepInfoBefore = (await page.locator('[data-cnn-step-info]').textContent())?.trim() ?? '';
    await page.click('[data-cnn-step-next]');
    await page.waitForTimeout(100);
    const stepInfoAfter = (await page.locator('[data-cnn-step-info]').textContent())?.trim() ?? '';

    if (stepInfoBefore.includes('Step 1') && stepInfoAfter.includes('Step 2')) {
      pass(`Step forward advances active step: "${stepInfoBefore}" → "${stepInfoAfter}"`);
    } else {
      fail('Step forward action', `Before="${stepInfoBefore}", After="${stepInfoAfter}"`);
    }

    // 3. Kernel Preset Switching (Laplacian)
    await page.click('[data-cnn-preset-kernel="laplacian"]');
    await page.waitForTimeout(150);

    const isLaplacianActive = await page.locator('[data-cnn-preset-kernel="laplacian"]').evaluate((el) => el.classList.contains('active'));
    const kernelTexts = await page.locator('[data-cnn-kernel-grid] .cnn-cell').allInnerTexts();
    const hasCenterNegativeFour = kernelTexts.some((txt) => txt.includes('-4'));

    if (isLaplacianActive && hasCenterNegativeFour) {
      pass('Kernel preset switching: Laplacian preset activated and kernel matrix shows center weight -4');
    } else {
      fail('Kernel preset switching', `Laplacian active=${isLaplacianActive}, center -4 present=${hasCenterNegativeFour}`);
    }

    // 4. Mode Switch: 1D Biological Sequence Mode
    await page.click('[data-cnn-tab="1d"]');
    await page.waitForTimeout(200);

    const panel1dDisplay = await page.locator('[data-cnn-panel="1d"]').evaluate((el) => window.getComputedStyle(el).display);
    const isPanel1dVisible = await page.locator('[data-cnn-panel="1d"]').isVisible();
    const seqTrackCount = await page.locator('[data-cnn-seq-track] > *').count();
    const scoreChartBars = await page.locator('[data-cnn-score-chart] svg rect').count();

    if (panel1dDisplay !== 'none' && isPanel1dVisible && seqTrackCount > 0 && scoreChartBars > 0) {
      pass(`1D Sequence mode: Panel visible (display=${panel1dDisplay}), Sequence track rendered (${seqTrackCount} nucleotides), Score chart has ${scoreChartBars} bars`);
    } else {
      fail('1D Sequence mode switch', `display=${panel1dDisplay}, visible=${isPanel1dVisible}, trackCount=${seqTrackCount}, bars=${scoreChartBars}`);
    }

    // Capture 1D Mode Screenshot
    const shot1dPath = path.join(SCRATCH_DIR, 'cnn_studio_1d_mode.png');
    await page.screenshot({ path: shot1dPath, fullPage: false });
    pass(`Saved 1D mode screenshot to ${shot1dPath}`);

    // 5. Mode Switch: Return to 2D Vision Mode
    await page.click('[data-cnn-tab="2d"]');
    await page.waitForTimeout(200);

    const panel2dDisplay = await page.locator('[data-cnn-panel="2d"]').evaluate((el) => window.getComputedStyle(el).display);
    const isPanel2dVisible = await page.locator('[data-cnn-panel="2d"]').isVisible();
    const isPanel1dHidden = !(await page.locator('[data-cnn-panel="1d"]').isVisible());

    if (panel2dDisplay !== 'none' && isPanel2dVisible && isPanel1dHidden) {
      pass('2D Vision mode restored: 2D panel visible and 1D panel hidden');
    } else {
      fail('2D Vision mode switch', `2dDisplay=${panel2dDisplay}, 2dVisible=${isPanel2dVisible}, 1dHidden=${isPanel1dHidden}`);
    }

    // 6. PyTorch Snippet Generator & Copy Button
    const pytorchCode = (await page.locator('[data-cnn-pytorch-code]').textContent()) ?? '';
    const hasConv2d = pytorchCode.includes('nn.Conv2d');

    await page.click('[data-cnn-copy-pytorch]');
    await page.waitForTimeout(150);
    const copyBtnContent = (await page.locator('[data-cnn-copy-pytorch]').textContent()) ?? '';
    const copySuccessful = copyBtnContent.includes('Copied!') || copyBtnContent.includes('✓');

    if (hasConv2d && copySuccessful) {
      pass(`PyTorch module generator: snippet contains 'nn.Conv2d' and copy button shows '${copyBtnContent.trim()}'`);
    } else {
      fail('PyTorch code & copy', `hasConv2d=${hasConv2d}, copySuccessful=${copySuccessful} (btn text="${copyBtnContent.trim()}")`);
    }

    // 7. Receptive Field Expansion Ladder
    const initialRfLayers = await page.locator('[data-cnn-rf-ladder] > *').count();
    await page.click('[data-cnn-rf-add-layer]');
    await page.waitForTimeout(100);
    const updatedRfLayers = await page.locator('[data-cnn-rf-ladder] > *').count();

    if (updatedRfLayers === initialRfLayers + 1) {
      pass(`Receptive field ladder: adding layer scaled layer count from ${initialRfLayers} → ${updatedRfLayers}`);
    } else {
      fail('Receptive field ladder', `Expected ${initialRfLayers + 1} layers, got ${updatedRfLayers}`);
    }

    // -------------------------------------------------------------------------
    // Phase 3: Visual Screenshot Capture
    // -------------------------------------------------------------------------
    console.log('\n--- Phase 3: UI Screenshots ---');
    // Desktop 1280x800
    await page.setViewportSize({ width: 1280, height: 800 });
    const shotDesktopPath = path.join(SCRATCH_DIR, 'cnn_studio_desktop_1280.png');
    await page.screenshot({ path: shotDesktopPath, fullPage: false });
    pass(`Saved desktop screenshot to ${shotDesktopPath}`);

    // Mobile 375x667
    await page.setViewportSize({ width: 375, height: 667 });
    const shotMobilePath = path.join(SCRATCH_DIR, 'cnn_studio_mobile_375.png');
    await page.screenshot({ path: shotMobilePath, fullPage: false });
    pass(`Saved mobile screenshot to ${shotMobilePath}`);

    // Console Errors Check
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
    console.log('🎉 ALL CNN INTERACTIVE LABORATORY AUDIT CHECKS PASSED CLEANLY!');
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
