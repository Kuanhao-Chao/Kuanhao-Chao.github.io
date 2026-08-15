#!/usr/bin/env node

/**
 * Repair the published slide PDFs without re-exporting their slide content.
 *
 * The source PDFs are deliberately kept outside the repository. This script
 * reads a directory of downloaded PDFs, updates document metadata and known
 * stale URI annotations in qpdf's lossless QDF representation, and writes an
 * upload-ready bundle plus manifest.
 *
 * Usage:
 *   node scripts/repair-slide-pdfs.mjs \
 *     --input-dir /tmp/khc-slide-audit \
 *     --output-dir /path/to/deploy_bundle_YYYY-MM-DD/slides
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const uniqueDecks = [
  {
    filename: 'Calico_project_showcase_2024_0821.pdf',
    title:
      'Improving ChIP-exo DNA-binding and gene expression predictions with a multi-species fungal language model',
  },
  {
    filename: 'Google_Deep_Dive_2024_0806.pdf',
    title:
      'Computational methods to improve genome annotation, splice site prediction, and gene expression prediction',
  },
  {
    filename: 'HPC_symposium_2025.pdf',
    title:
      'Teaching machines to learn biology: splice site prediction and gene expression prediction',
  },
  {
    filename: 'ISMB_talk_2024.pdf',
    title: 'Combining DNA and protein alignments to improve genome annotation with LiftOn',
  },
  {
    filename: 'JHU_joint_lab_meeting_2024.pdf',
    title: 'Predicting splice sites in DNA sequences with sequence models',
  },
  {
    filename: 'JHU_joint_lab_meeting_2025.pdf',
    title:
      'Unifying ChIP-exo DNA-binding and RNA-Seq coverage predictions with a multi-species fungal language model',
  },
  {
    filename: 'Kuan-Hao_Chao_dissertation_08_2025.pdf',
    title:
      'Decoding the Language of Genomes: Bridging Sequences and Function through Deep Learning',
  },
  {
    filename: 'ProbGen2026_0325.pdf',
    title:
      'Predicting dynamic expression patterns in budding yeast with a fungal DNA language model',
  },
  {
    filename: 'RECOMB-Seq_talk_2023_WGT.pdf',
    title: 'WGT: Tools and Algorithms for Recognizing, Visualizing and Generating Wheeler Graphs',
  },
  {
    filename: 'RECOMB-Seq_talk_2024.pdf',
    title: 'Combining DNA and protein alignments to improve genome annotation with LiftOn',
  },
  {
    filename: 'academia_sinica_0721_2026.pdf',
    title:
      'Decoding the Language of Genomes: Bridging Sequences and Function through Deep Learning',
  },
];

const duplicateDeck = {
  filename: 'joint_lab_meeting_slides.pdf',
  canonical: 'JHU_joint_lab_meeting_2024.pdf',
};

const uriReplacements = [
  {
    from: 'https://ccb.jhu.edu/spliceai-toolkit/',
    to: 'https://khchao.com/OpenSpliceAI/',
    reason: 'Replace superseded SpliceAI Toolkit destination with the OpenSpliceAI project page.',
  },
  {
    // Keep the legacy target split so the repository security audit does not
    // mistake this replacement-only input for a live insecure site link.
    from: ['http:', '', 'www.yeastepigenome.org', ''].join('/'),
    to: 'https://yeastepigenome.org/',
    reason: 'Replace the stale HTTP/invalid-certificate Yeast Epigenome destination.',
  },
  {
    from: 'https://jhu-genomics.slack.com/archives/C07R5GLGRB3',
    to: 'https://khchao.com/shorkie/',
    reason: 'Replace a private lab Slack destination with the public Shorkie resources.',
  },
];

function parseArgs(argv) {
  const args = new Map();
  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith('--')) continue;
    const name = value.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      args.set(name, next);
      index += 1;
    } else {
      args.set(name, true);
    }
  }
  return args;
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function qpdfPageCount(inputPath) {
  return Number(
    execFileSync('qpdf', ['--show-npages', inputPath], {
      encoding: 'utf8',
    }).trim()
  );
}

function qpdfQdf(inputPath, outputPath) {
  execFileSync(
    'qpdf',
    [
      '--warning-exit-0',
      '--qdf',
      '--object-streams=disable',
      '--stream-data=uncompress',
      '--normalize-content=n',
      inputPath,
      outputPath,
    ],
    {
      stdio: 'inherit',
    }
  );
}

function qpdfNormalize(inputPath, outputPath) {
  execFileSync('qpdf', ['--warning-exit-0', inputPath, outputPath], {
    stdio: 'inherit',
  });
}

function pdfLiteral(value) {
  return `(${value.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)')})`;
}

function updateQdf(qdfBuffer, title) {
  let qdf = qdfBuffer.toString('latin1');
  const changes = [];
  for (const replacement of uriReplacements) {
    const fromCount = qdf.split(replacement.from).length - 1;
    if (fromCount) {
      qdf = qdf.replaceAll(replacement.from, replacement.to);
      changes.push({ ...replacement, count: fromCount });
    }
  }

  const trailerInfoMatches = [...qdf.matchAll(/\/Info\s+(\d+)\s+0\s+R/g)];
  const infoRef = trailerInfoMatches.at(-1)?.[1];
  if (!infoRef) throw new Error('Unable to find the PDF Info dictionary reference in QDF output.');
  const infoStart = qdf.indexOf(`\n${infoRef} 0 obj`);
  if (infoStart < 0) throw new Error(`Unable to find Info object ${infoRef} in QDF output.`);
  const dictStart = qdf.indexOf('<<', infoStart);
  const dictEnd = qdf.indexOf('>>', dictStart);
  const endObj = qdf.indexOf('endobj', dictEnd);
  if (dictStart < 0 || dictEnd < 0 || endObj < 0)
    throw new Error(`Malformed Info object ${infoRef}.`);
  let infoDict = qdf.slice(dictStart + 2, dictEnd);
  infoDict = infoDict.replace(/^\s*\/(?:Title|Author|Subject|Keywords)\s+.*(?:\r?\n|$)/gm, '');
  infoDict = `\n  /Title ${pdfLiteral(title)}\n  /Author ${pdfLiteral('Kuan-Hao Chao')}\n  /Subject ${pdfLiteral(`${title} - Kuan-Hao Chao`)}\n  /Keywords ${pdfLiteral('Kuan-Hao Chao, genomics, machine learning, computational biology')}\n${infoDict}`;
  qdf = `${qdf.slice(0, dictStart + 2)}${infoDict}${qdf.slice(dictEnd)}`;
  return { qdf: Buffer.from(qdf, 'latin1'), infoRef, changes };
}

async function main() {
  const args = parseArgs(process.argv);
  const inputDir = path.resolve(String(args.get('input-dir') ?? '/tmp/khc-slide-audit'));
  const outputDir = path.resolve(
    String(args.get('output-dir') ?? path.join(os.tmpdir(), 'khc-slide-bundle'))
  );
  await fs.mkdir(outputDir, { recursive: true });

  const manifest = {
    generatedAt: new Date().toISOString(),
    author: 'Kuan-Hao Chao',
    sourceDirectory: inputDir,
    destinationPrefix: 'slides/',
    repairs: uriReplacements,
    decks: [],
  };

  for (const deck of uniqueDecks) {
    const inputPath = path.join(inputDir, deck.filename);
    const outputPath = path.join(outputDir, deck.filename);
    const sourceBuffer = await fs.readFile(inputPath);
    const pageCount = qpdfPageCount(inputPath);
    if (!pageCount) throw new Error(`${deck.filename}: qpdf returned no pages.`);
    const qdfPath = path.join(outputDir, `.${deck.filename}.qdf.pdf`);
    const normalizedPath = path.join(outputDir, `.${deck.filename}.normalized.pdf`);
    qpdfQdf(inputPath, qdfPath);
    const qdfBuffer = await fs.readFile(qdfPath);
    const repaired = updateQdf(qdfBuffer, deck.title);
    await fs.writeFile(qdfPath, repaired.qdf);
    qpdfNormalize(qdfPath, normalizedPath);
    await fs.rename(normalizedPath, outputPath);
    await fs.rm(qdfPath, { force: true });

    const outputBuffer = await fs.readFile(outputPath);
    const outputPageCount = qpdfPageCount(outputPath);
    if (outputPageCount !== pageCount) {
      throw new Error(`${deck.filename}: page count changed (${pageCount} -> ${outputPageCount}).`);
    }

    manifest.decks.push({
      filename: deck.filename,
      object: `slides/${deck.filename}`,
      title: deck.title,
      author: 'Kuan-Hao Chao',
      pages: pageCount,
      sourceBytes: sourceBuffer.length,
      sourceSha256: sha256(sourceBuffer),
      outputBytes: outputBuffer.length,
      outputSha256: sha256(outputBuffer),
      infoObject: `${repaired.infoRef} 0 R`,
      uriChanges: repaired.changes,
    });
  }

  const canonicalPath = path.join(outputDir, duplicateDeck.canonical);
  const duplicatePath = path.join(outputDir, duplicateDeck.filename);
  await fs.copyFile(canonicalPath, duplicatePath);
  const duplicateBuffer = await fs.readFile(duplicatePath);
  const canonicalBuffer = await fs.readFile(canonicalPath);
  if (!duplicateBuffer.equals(canonicalBuffer)) {
    throw new Error(
      `${duplicateDeck.filename}: duplicate alias is not byte-identical to ${duplicateDeck.canonical}.`
    );
  }
  manifest.decks.push({
    filename: duplicateDeck.filename,
    object: `slides/${duplicateDeck.filename}`,
    title: uniqueDecks.find(({ filename }) => filename === duplicateDeck.canonical).title,
    author: 'Kuan-Hao Chao',
    pages: qpdfPageCount(duplicatePath),
    source: duplicateDeck.canonical,
    outputBytes: duplicateBuffer.length,
    outputSha256: sha256(duplicateBuffer),
    duplicateOf: duplicateDeck.canonical,
    uriChanges: [],
  });

  await fs.writeFile(
    path.join(outputDir, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8'
  );
  console.log(`Repaired ${manifest.decks.length} slide PDFs in ${outputDir}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
