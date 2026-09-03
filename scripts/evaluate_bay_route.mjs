import { chromium } from 'playwright';

const PRESETS = [
  { id: 'trip_sf_to_berkeley', name: 'SF to Berkeley' },
  { id: 'trip_nyc_manhattan', name: 'Times Sq to Brooklyn' },
  { id: 'trip_tokyo_shibuya', name: 'Shibuya to Tokyo Tower' },
  { id: 'trip_london_thames', name: 'Westminster to Tower Bridge' },
  { id: 'trip_taipei_101', name: 'Taipei 101 to Shilin' },
  { id: 'trip_sfo_to_stanford', name: 'Silicon Valley Corridor' },
];

const ALGORITHMS = [
  { id: 'dijkstra', name: 'Dijkstra' },
  { id: 'a_star', name: 'A* Search' },
  { id: 'bidirectional_a_star', name: 'Bidirectional A*' },
  { id: 'greedy', name: 'Greedy Best-First' },
  { id: 'bfs', name: 'Breadth-First Search' },
  { id: 'dfs', name: 'Depth-First Search' },
];

async function evaluateAll() {
  console.log('Starting End-to-End Multi-Path & Multi-Algorithm Evaluation...\n');

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('http://localhost:4321/games/bay-route/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const results = [];

  for (const preset of PRESETS) {
    console.log(`\n======================================================`);
    console.log(`Testing Corridor: ${preset.name} (${preset.id})`);
    console.log(`======================================================`);

    // Click the preset button
    const btn = page.locator(`button[data-trip-id="${preset.id}"]`);
    await btn.click();
    await page.waitForTimeout(1000);

    for (const alg of ALGORITHMS) {
      // Select algorithm in dropdown
      await page.selectOption('select[data-br-algo]', alg.id);
      await page.waitForTimeout(600);

      // Extract telemetry and state
      const state = await page.evaluate(() => {
        const explored = document.querySelector('[data-metric-explored]')?.textContent?.trim();
        const frontier = document.querySelector('[data-metric-frontier]')?.textContent?.trim();
        const distance = document.querySelector('[data-metric-distance]')?.textContent?.trim();
        const time = document.querySelector('[data-metric-time]')?.textContent?.trim();
        const optimality = document.querySelector('[data-metric-optimality]')?.textContent?.trim();
        const maneuvers = document.querySelectorAll('.br-maneuver-item').length;

        // Check canvas pixels
        const canvas = document.querySelector('canvas');
        let nonZero = 0;
        if (canvas) {
          const ctx = canvas.getContext('2d');
          const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          for (let i = 3; i < data.length; i += 16) {
            if (data[i] > 0) nonZero++;
          }
        }

        return { explored, frontier, distance, time, optimality, maneuvers, nonZero };
      });

      const passed =
        state.distance &&
        state.distance !== '—' &&
        state.distance !== 'Searching...' &&
        parseInt(state.explored, 10) > 0 &&
        state.maneuvers > 0 &&
        state.nonZero > 0;

      results.push({
        corridor: preset.name,
        algorithm: alg.name,
        distance: state.distance,
        time: state.time,
        explored: state.explored,
        frontier: state.frontier,
        maneuvers: state.maneuvers,
        canvasPixels: state.nonZero,
        passed,
      });

      console.log(
        `  - ${alg.name.padEnd(22)}: Dist=${state.distance}, Time=${state.time}, Explored=${state.explored.padEnd(3)}, Steps=${state.maneuvers}, Canvas=${state.nonZero > 0 ? '✓' : '✗'} [${passed ? 'PASS' : 'FAIL'}]`
      );
    }
  }

  // Test 5-Algorithm Race Mode
  console.log(`\n======================================================`);
  console.log(`Testing 5-Algorithm Race Mode (Times Sq to Brooklyn)`);
  console.log(`======================================================`);

  const nycBtn = page.locator('button[data-trip-id="trip_nyc_manhattan"]');
  await nycBtn.scrollIntoViewIfNeeded();
  await nycBtn.click();
  await page.waitForTimeout(1500);

  const raceModeBtn = page.locator('button[data-mode="race"]');
  await raceModeBtn.scrollIntoViewIfNeeded();
  await raceModeBtn.click();

  // Wait until leaderboard is populated with 5 algorithms
  await page.waitForFunction(() => {
    const rows = document.querySelectorAll('[data-br-race-body] tr');
    return rows && rows.length === 5;
  }, { timeout: 10000 });

  const raceState = await page.evaluate(() => {
    const section = document.querySelector('[data-br-race-section]');
    const rows = Array.from(document.querySelectorAll('[data-br-race-body] tr')).map((tr) => {
      const cols = Array.from(tr.querySelectorAll('td')).map((td) => td.textContent.trim());
      return {
        rank: cols[0],
        alg: cols[1],
        explored: cols[2],
        frontier: cols[3],
        distance: cols[4],
        time: cols[5],
        status: cols[6],
      };
    });
    return {
      sectionHidden: section ? section.hidden : null,
      rowCount: rows.length,
      rows,
    };
  });

  console.log(`Leaderboard Section Hidden: ${raceState.sectionHidden}`);
  console.log(`Leaderboard Rows Populated: ${raceState.rowCount}`);
  raceState.rows.forEach((r) => {
    console.log(`  ${r.rank.padEnd(4)} ${r.alg.padEnd(24)} Explored=${r.explored.padEnd(3)} Dist=${r.distance} Status=${r.status}`);
  });

  await browser.close();

  const allPassed = results.every((r) => r.passed) && raceState.rowCount === 5 && errors.length === 0;

  console.log('\n======================================================');
  console.log(`FINAL EVALUATION RESULT: ${allPassed ? 'ALL TESTS PASSED (100%)' : 'SOME TESTS FAILED'}`);
  console.log(`Total Algorithm-Corridor Combinations Tested: ${results.length}`);
  console.log(`Total Race Mode Tests: 1 (5 algorithms concurrently)`);
  console.log(`Page Errors: ${errors.length}`);
  console.log('======================================================\n');

  if (!allPassed) {
    process.exit(1);
  }
}

evaluateAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
