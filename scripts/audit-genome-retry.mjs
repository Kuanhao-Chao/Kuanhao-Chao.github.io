import { chromium } from 'playwright';
import { auditGenomeRetry } from './audit-genome-ui.mjs';

// Controlled latency reproduces CI's retry/readiness race without a fixed sleep fix.
const baseURL = process.env.GENOME_RETRY_BASE_URL || 'http://127.0.0.1:4322';
const browser = await chromium.launch();
try {
  await auditGenomeRetry(browser, baseURL);
} finally { await browser.close(); }
