#!/usr/bin/env node

/**
 * End-to-End Playwright Verification Test Suite for Transformer Interactive Laboratory
 *
 * Validates:
 * 1. 4 Responsive Viewports (Desktop 1280x800, Tablet 768x1024, Mobile 375x667, Small Mobile 320x568)
 * 2. Zero Horizontal Overflow across all viewports:
 *    document.documentElement.scrollWidth <= document.documentElement.clientWidth
 * 3. Interactive User Flows:
 *    - Token list, attention heatmap, and stage badge are rendered
 *    - Step forward navigation ([data-transformer-next]) advances active stage
 *    - Preset switching ([data-transformer-preset="dnaPromoter"]) updates tokens and attention matrix
 *    - Attention heatmap cell click displays mathematical X-Ray arithmetic trace
 *    - Architectural toggle ([data-transformer-arch-btn="modern"]) updates PyTorch snippet with RMSNorm
 *    - PyTorch snippet contains scaled_dot_product_attention and copy button works
 * 4. High-resolution visual screenshots saved to scratch directory:
 *    - Desktop: transformer_studio_desktop_1280.png
 *    - Mobile: transformer_studio_mobile_375.png
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
  if (await probeUrl('http://localhost:4321/nn-lab/transformer/')) {
    console.log('✓ Found active Astro server at http://localhost:4321');
    return { baseUrl: 'http://localhost:4321', close: async () => {} };
  }

  // Check if server is running on port 4339
  if (await probeUrl('http://localhost:4339/nn-lab/transformer/')) {
    console.log('✓ Found active server at http://localhost:4339');
    return { baseUrl: 'http://localhost:4339', close: async () => {} };
  }

  // Otherwise launch preview server from dist/ if built
  const distHtml = path.join(ROOT, 'dist', 'nn-lab', 'transformer', 'index.html');
  if (fs.existsSync(distHtml)) {
    console.log('Starting Astro preview server on port 4345 from dist/...');
    const previewServer = await preview({
      root: ROOT,
      server: { port: 4345 },
    });
    return {
      baseUrl: 'http://localhost:4345',
      close: async () => {
        await previewServer.stop();
      },
    };
  }

  // Fallback: spin up dev server
  console.log('Starting Astro dev server on port 4345...');
  const devServer = await dev({
    root: ROOT,
    server: { port: 4345 },
  });
  return {
    baseUrl: 'http://localhost:4345',
    close: async () => {
      await devServer.stop();
    },
  };
}

async function runAudit() {
  console.log('===============================================================');
  console.log('🚀 TRANSFORMER INTERACTIVE LABORATORY AUDIT & VERIFICATION');
  console.log('===============================================================');

  fs.mkdirSync(SCRATCH_DIR, { recursive: true });

  const { baseUrl, close: closeServer } = await resolveServer();
  const labUrl = `${baseUrl}/nn-lab/transformer/`;

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
      await page.waitForSelector('[data-transformer-studio-ready="true"]', { timeout: 8000 });

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
    await page.waitForSelector('[data-transformer-studio-ready="true"]', { timeout: 8000 });

    // 1. Verify token list, attention heatmap, and stage badge are rendered
    const tokenBadgeCount = await page.locator('[data-transformer-token-list] .transformer-token-badge').count();
    const heatmapCellCount = await page.locator('[data-transformer-heatmap] .transformer-heatmap-cell').count();
    const stageBadgeText = (await page.locator('[data-transformer-stage-badge]').textContent())?.trim() ?? '';

    if (tokenBadgeCount === 11 && heatmapCellCount === 121 && stageBadgeText.includes('1/8')) {
      pass(
        `Initial rendering verified: ${tokenBadgeCount} token badges, ${heatmapCellCount} heatmap cells, stage badge="${stageBadgeText}"`
      );
    } else {
      fail(
        'Initial rendering check',
        `Expected 11 tokens, 121 cells, 1/8 badge. Got: tokens=${tokenBadgeCount}, cells=${heatmapCellCount}, badge="${stageBadgeText}"`
      );
    }

    // 2. Click step forward ([data-transformer-next]) and verify stage advances
    await page.click('[data-transformer-next]');
    await page.waitForTimeout(150);
    const updatedStageBadgeText = (await page.locator('[data-transformer-stage-badge]').textContent())?.trim() ?? '';

    if (updatedStageBadgeText.includes('2/8')) {
      pass(`Step forward navigation: Stage advanced from "${stageBadgeText}" → "${updatedStageBadgeText}"`);
    } else {
      fail('Step forward navigation', `Expected stage 2/8, got "${updatedStageBadgeText}"`);
    }

    // 3. Click preset button (dnaPromoter) and verify tokens and attention matrix update
    await page.click('[data-transformer-preset="dnaPromoter"]');
    await page.waitForTimeout(200);

    const promoterTokens = await page
      .locator('[data-transformer-token-list] .transformer-token-badge')
      .allInnerTexts();
    const promoterCellCount = await page.locator('[data-transformer-heatmap] .transformer-heatmap-cell').count();
    const isPromoterActive = await page
      .locator('[data-transformer-preset="dnaPromoter"]')
      .evaluate((el) => el.classList.contains('active') || el.getAttribute('aria-pressed') === 'true');

    if (
      isPromoterActive &&
      promoterTokens.some((t) => t.includes('TATAAA')) &&
      promoterCellCount === 25
    ) {
      pass(
        `Preset switching (dnaPromoter): Active=${isPromoterActive}, tokens=[${promoterTokens.join(', ')}], heatmap cells=${promoterCellCount}`
      );
    } else {
      fail(
        'Preset switching (dnaPromoter)',
        `Active=${isPromoterActive}, tokens=${JSON.stringify(promoterTokens)}, cells=${promoterCellCount}`
      );
    }

    // 4. Click an attention heatmap cell and verify X-Ray drawer displays mathematical breakdown
    const firstCell = page.locator('[data-transformer-heatmap] [data-cell-i="0"][data-cell-j="0"]');
    await firstCell.click();
    await page.waitForTimeout(200);

    const xrayText = (await page.locator('[data-transformer-xray]').textContent()) ?? '';
    const xrayHasTitle = xrayText.includes('Attention Arithmetic X-Ray');
    const xrayHasStep = xrayText.includes('Pairwise Inner Dot Product') || xrayText.includes('Step 1');
    const xrayMultRows = await page.locator('[data-transformer-xray] .xray-mult-table tbody tr').count();
    const isCellSelected = await firstCell.evaluate((el) => el.classList.contains('selected'));

    if (xrayHasTitle && xrayHasStep && xrayMultRows > 0 && isCellSelected) {
      pass(
        `Arithmetic X-Ray drawer: Cell (0,0) selected, drawer displays decomposition trace with ${xrayMultRows} multiplication dimension rows`
      );
    } else {
      fail(
        'Arithmetic X-Ray drawer inspection',
        `title=${xrayHasTitle}, step=${xrayHasStep}, multRows=${xrayMultRows}, selected=${isCellSelected}`
      );
    }

    // 5. Click architectural toggle ([data-transformer-arch-btn="classical"] then "modern")
    // Classical: check LayerNorm
    await page.click('[data-transformer-arch-btn="classical"]');
    await page.waitForTimeout(150);
    const classicalCode = (await page.locator('[data-transformer-pytorch-code]').textContent()) ?? '';
    const hasLayerNorm = classicalCode.includes('LayerNorm');

    // Modern: check RMSNorm
    await page.click('[data-transformer-arch-btn="modern"]');
    await page.waitForTimeout(150);
    const modernCode = (await page.locator('[data-transformer-pytorch-code]').textContent()) ?? '';
    const hasRMSNorm = modernCode.includes('RMSNorm');
    const isModernActive = await page
      .locator('[data-transformer-arch-btn="modern"]')
      .evaluate((el) => el.classList.contains('active') || el.getAttribute('aria-pressed') === 'true');

    if (hasLayerNorm && hasRMSNorm && isModernActive) {
      pass(
        `Architectural paradigm toggle: Classical generated LayerNorm, Modern generated RMSNorm (active=${isModernActive})`
      );
    } else {
      fail(
        'Architectural toggle',
        `hasLayerNorm=${hasLayerNorm}, hasRMSNorm=${hasRMSNorm}, isModernActive=${isModernActive}`
      );
    }

    // 6. Verify PyTorch snippet contains scaled_dot_product_attention and copy button works
    const hasScaledDot = modernCode.includes('scaled_dot_product_attention');

    await page.click('[data-transformer-copy-pytorch]');
    await page.waitForTimeout(150);
    const copyBtnText = (await page.locator('[data-transformer-copy-pytorch]').textContent()) ?? '';
    const copySucceeded = copyBtnText.includes('Copied') || copyBtnText.includes('✓');

    if (hasScaledDot && copySucceeded) {
      pass(
        `PyTorch code snippet & copy: snippet contains 'scaled_dot_product_attention', copy button updated to '${copyBtnText.trim()}'`
      );
    } else {
      fail(
        'PyTorch code & copy button',
        `hasScaledDot=${hasScaledDot}, copySucceeded=${copySucceeded} (button text="${copyBtnText.trim()}")`
      );
    }

    // -------------------------------------------------------------------------
    // Phase 3: Visual Screenshot Capture
    // -------------------------------------------------------------------------
    console.log('\n--- Phase 3: Visual Screenshot Capture ---');

    // Reset back to desktop default layout for clean capture
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.click('[data-transformer-preset="nlpWinograd"]');
    await page.waitForTimeout(200);

    const shotDesktopPath = path.join(SCRATCH_DIR, 'transformer_studio_desktop_1280.png');
    await page.screenshot({ path: shotDesktopPath, fullPage: false });
    pass(`Saved desktop screenshot to ${shotDesktopPath}`);

    // Mobile Viewport 375x667
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(200);
    const shotMobilePath = path.join(SCRATCH_DIR, 'transformer_studio_mobile_375.png');
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
    console.log('🎉 ALL TRANSFORMER INTERACTIVE LABORATORY AUDIT CHECKS PASSED CLEANLY!');
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
