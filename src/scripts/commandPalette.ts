/**
 * Global Spotlight Command Palette (⌘K / Ctrl+K)
 */
import { ALGORITHMS } from '../data/algorithms';
import { DEEP_DIVES } from '../data/deepDives';
import { PAPERS } from '../data/papers';
import { startDnaRain } from './dnaRain';
import { startCrisprMode } from './crisprMode';
import { startZeroGravity } from './domPhysics';
import { startCrtMode, stopCrtMode } from './retroCrt';
import { openRibosomeGame } from './ribosomeGameVisualizer';
import { startDnaSynth } from './dnaSynth';

export interface CommandItem {
  id: string;
  category: 'Actions' | 'Algorithms' | 'Navigation' | 'Publications' | 'Software' | 'Research' | 'Posts' | 'Talks' | 'News' | 'Games';
  title: string;
  subtitle?: string;
  badge?: string;
  icon?: string;
  href?: string;
  action?: () => void;
  keywords?: string[];
}

const STATIC_ACTIONS: CommandItem[] = [
  {
    id: 'act-theme-toggle',
    category: 'Actions',
    title: 'Toggle Base Theme (Light / Dark)',
    subtitle: 'Switch between light and dark base theme',
    badge: 'Theme',
    action: () => {
      if (typeof window !== 'undefined' && (window as unknown as { __khcTheme?: { toggle: () => void } }).__khcTheme) {
        (window as unknown as { __khcTheme: { toggle: () => void } }).__khcTheme.toggle();
      }
    },
    keywords: ['dark', 'light', 'mode', 'theme', 'color', 'toggle', 'base theme'],
  },
  {
    id: 'act-theme-light',
    category: 'Actions',
    title: 'Set Theme: ☀️ Light Mode',
    subtitle: 'Crisp Calico minimalist light theme',
    badge: 'Theme',
    action: () => {
      if (typeof window !== 'undefined' && (window as unknown as { __khcTheme?: { set: (t: string) => void } }).__khcTheme) {
        (window as unknown as { __khcTheme: { set: (t: string) => void } }).__khcTheme.set('light');
      }
    },
    keywords: ['light', 'day', 'paper', 'bright', 'white', 'theme'],
  },
  {
    id: 'act-theme-dark',
    category: 'Actions',
    title: 'Set Theme: 🌙 Dark Mode',
    subtitle: 'Deep slate and emerald dark theme',
    badge: 'Theme',
    action: () => {
      if (typeof window !== 'undefined' && (window as unknown as { __khcTheme?: { set: (t: string) => void } }).__khcTheme) {
        (window as unknown as { __khcTheme: { set: (t: string) => void } }).__khcTheme.set('dark');
      }
    },
    keywords: ['dark', 'night', 'black', 'slate', 'dim', 'theme'],
  },
  {
    id: 'act-theme-parchment',
    category: 'Actions',
    title: 'Set Theme: 📜 Bell Labs 1970s Parchment',
    subtitle: 'Warm aged paper with walnut sepia ink and burnt terracotta',
    badge: 'Theme',
    action: () => {
      if (typeof window !== 'undefined' && (window as unknown as { __khcTheme?: { set: (t: string) => void } }).__khcTheme) {
        (window as unknown as { __khcTheme: { set: (t: string) => void } }).__khcTheme.set('parchment');
      }
    },
    keywords: ['parchment', 'bell labs', 'sepia', 'paper', 'knuth', 'tex', 'smalltalk', 'theme'],
  },
  {
    id: 'act-theme-nord',
    category: 'Actions',
    title: 'Set Theme: 🌌 Arctic Nord Computational',
    subtitle: 'Polar night dark mode with arctic ice cyan accents',
    badge: 'Theme',
    action: () => {
      if (typeof window !== 'undefined' && (window as unknown as { __khcTheme?: { set: (t: string) => void } }).__khcTheme) {
        (window as unknown as { __khcTheme: { set: (t: string) => void } }).__khcTheme.set('nord');
      }
    },
    keywords: ['nord', 'arctic', 'developer', 'polar', 'ice', 'ide', 'theme'],
  },
  {
    id: 'act-theme-monokai',
    category: 'Actions',
    title: 'Set Theme: 🕹️ Monokai Pro Compiler',
    subtitle: 'Warm charcoal editor theme with compiler gold and syntax rose',
    badge: 'Theme',
    action: () => {
      if (typeof window !== 'undefined' && (window as unknown as { __khcTheme?: { set: (t: string) => void } }).__khcTheme) {
        (window as unknown as { __khcTheme: { set: (t: string) => void } }).__khcTheme.set('monokai');
      }
    },
    keywords: ['monokai', 'compiler', 'gold', 'code', 'editor', 'theme'],
  },
  {
    id: 'act-theme-cyberdeck',
    category: 'Actions',
    title: 'Set Theme: 📟 DEC VT220 / Cyberdeck',
    subtitle: 'Obsidian navy with electric ice cyan phosphor glow',
    badge: 'Theme',
    action: () => {
      if (typeof window !== 'undefined' && (window as unknown as { __khcTheme?: { set: (t: string) => void } }).__khcTheme) {
        (window as unknown as { __khcTheme: { set: (t: string) => void } }).__khcTheme.set('cyberdeck');
      }
    },
    keywords: ['cyberdeck', 'cyan', 'vt220', 'dec', 'matrix', 'terminal', 'theme'],
  },
  {
    id: 'act-crt-amber',
    category: 'Actions',
    title: '📺 1988 CRT Monitor: ⚡ Amber Phosphor',
    subtitle: 'Vintage NIH Alpha VAX Amber CRT display with scanlines',
    badge: 'Display',
    action: () => {
      startCrtMode('amber');
    },
    keywords: ['crt', 'retro', '1988', 'amber', 'phosphor', 'terminal', 'scanlines', 'display'],
  },
  {
    id: 'act-crt-green',
    category: 'Actions',
    title: '📺 1988 CRT Monitor: 🟢 Green Phosphor',
    subtitle: 'Classic 1988 Supercomputer Green CRT display with scanlines',
    badge: 'Display',
    action: () => {
      startCrtMode('green');
    },
    keywords: ['crt', 'retro', '1988', 'green', 'phosphor', 'terminal', 'scanlines', 'display'],
  },
  {
    id: 'act-crt-cyan',
    category: 'Actions',
    title: '📺 1988 CRT Monitor: 🔷 Cyan Phosphor',
    subtitle: 'Vintage DEC VT220 Vector Cyan CRT display with scanlines',
    badge: 'Display',
    action: () => {
      startCrtMode('cyan');
    },
    keywords: ['crt', 'retro', '1988', 'cyan', 'vt220', 'phosphor', 'terminal', 'scanlines', 'display'],
  },
  {
    id: 'act-crt-off',
    category: 'Actions',
    title: '🖥️ Modern Display Mode (CRT Off)',
    subtitle: 'Disable CRT scanlines and return to modern display',
    badge: 'Display',
    action: () => {
      stopCrtMode();
    },
    keywords: ['crt off', 'modern', 'disable crt', 'normal display', 'turn off crt'],
  },
  {
    id: 'act-terminal',
    category: 'Actions',
    title: 'Open Web Terminal',
    subtitle: 'Interactive Unix shell with genomic CLI tools ($ terminal)',
    badge: 'Shell',
    href: '/terminal/',
    keywords: ['terminal', 'shell', 'bash', 'zsh', 'cli', 'console'],
  },
  {
    id: 'act-cv-download',
    category: 'Actions',
    title: 'Download CV (PDF)',
    subtitle: 'Download complete academic curriculum vitae',
    badge: 'PDF',
    href: '/cv.pdf',
    keywords: ['cv', 'resume', 'pdf', 'download', 'curriculum', 'vitae'],
  },
  {
    id: 'act-copy-email',
    category: 'Actions',
    title: 'Copy Email Address',
    subtitle: 'Copy kuanhao.chao@gmail.com to clipboard',
    badge: 'Contact',
    action: () => {
      if (navigator.clipboard) {
        navigator.clipboard.writeText('kuanhao.chao@gmail.com');
      }
    },
    keywords: ['email', 'copy', 'contact', 'mail', 'reach out'],
  },
  {
    id: 'act-crispr',
    category: 'Actions',
    title: '✂️ CRISPR-Cas9 Molecular Scissors',
    subtitle: "Precision Cas9 PAM cleavage mode (or type 'crispr' anywhere)",
    badge: 'Easter Egg',
    action: () => {
      startCrisprMode();
    },
    keywords: ['crispr', 'cas9', 'cut', 'scissors', 'cleave', 'pam', 'genome', 'easter egg'],
  },
  {
    id: 'act-zerog',
    category: 'Actions',
    title: '🌌 Zero-Gravity DOM Physics',
    subtitle: "Detaches page elements into a 2D physics sandbox (type 'gravity')",
    badge: 'Easter Egg',
    action: () => {
      startZeroGravity();
    },
    keywords: ['gravity', 'zerog', 'physics', 'sandbox', 'float', 'black hole', 'easter egg'],
  },
  {
    id: 'act-ribosome',
    category: 'Actions',
    title: '🧬 Ribosome Translation Rush (Arcade)',
    subtitle: "Playable mRNA codon translation & splicing game (type 'ribosome')",
    badge: 'Game',
    action: () => {
      openRibosomeGame();
    },
    keywords: ['ribosome', 'translation', 'splice', 'game', 'arcade', 'mrna', 'trna', 'easter egg'],
  },
  {
    id: 'act-synth',
    category: 'Actions',
    title: '🎹 DNA Polyphonic Synthesizer',
    subtitle: "Play nucleotide harmonic frequencies with oscilloscope (type 'synth')",
    badge: 'Audio',
    action: () => {
      startDnaSynth();
    },
    keywords: ['synth', 'piano', 'audio', 'music', 'dna', 'nucleotide', 'frequencies', 'easter egg'],
  },
  {
    id: 'act-dna-rain',
    category: 'Actions',
    title: 'Launch Matrix DNA Rain',
    subtitle: "Digital rain of cascading nucleotides (or type 'dna' anywhere)",
    badge: 'Easter Egg',
    action: () => {
      startDnaRain();
    },
    keywords: ['matrix', 'rain', 'dna', 'konami', 'easter egg', 'animation', 'nucleotide', 'helix', 'cascade'],
  },
];

const STATIC_NAV: CommandItem[] = [
  { id: 'nav-home', category: 'Navigation', title: 'Home', subtitle: 'Overview, research focus, and updates', href: '/' },
  { id: 'nav-research', category: 'Navigation', title: 'Research Areas', subtitle: 'Core themes in computational genomics and ML', href: '/research/' },
  { id: 'nav-publications', category: 'Navigation', title: 'Publications', subtitle: 'Peer-reviewed papers, preprints, and citations', href: '/publications/' },
  { id: 'nav-software', category: 'Navigation', title: 'Software & Open Source', subtitle: 'LiftOn, Splam, OpenSpliceAI, Shorkie, WGT', href: '/software/' },
  { id: 'nav-algorithms', category: 'Navigation', title: 'Algorithms Hub', subtitle: 'Interactive visualizers for CS & genomic algorithms', href: '/algorithms/' },
  { id: 'nav-deep-dives', category: 'Navigation', title: 'Deep Dives Hub', subtitle: 'Computational genomics foundations & concept posts', href: '/deep_dives/' },
  { id: 'nav-papers', category: 'Navigation', title: 'Paper Summaries', subtitle: 'Detailed literature deconstructions & methodology summaries', href: '/papers/' },
  { id: 'nav-teaching', category: 'Navigation', title: 'Teaching & Mentorship', subtitle: 'Courses, students mentored, pedagogical visualizers', href: '/teaching/' },
  { id: 'nav-talks', category: 'Navigation', title: 'Talks & Presentations', subtitle: 'Invited talks, conference presentations, slides', href: '/talks/' },
  { id: 'nav-news', category: 'Navigation', title: 'Recent News', subtitle: 'Academic updates, awards, and milestones', href: '/news/' },
  { id: 'nav-posts', category: 'Navigation', title: 'Blog Posts & Explaners', subtitle: 'Deep dives and interactive articles', href: '/posts/' },
  { id: 'nav-cv', category: 'Navigation', title: 'Curriculum Vitae', subtitle: 'Education, experience, honors, and service', href: '/cv/' },
  { id: 'nav-photos', category: 'Navigation', title: 'Photos & Life', subtitle: 'Academic travels and conferences', href: '/photos/' },
  { id: 'nav-games', category: 'Games', title: 'Genomic Mini-Games', subtitle: 'Tetris, Snake, Genome Jumper, Dino Run, Proofreader', href: '/games/tetris/' },
];

const ALGORITHM_ITEMS: CommandItem[] = ALGORITHMS.map((algo) => ({
  id: `algo-${algo.id}`,
  category: 'Algorithms',
  title: algo.title,
  subtitle: algo.blurb || algo.summary,
  badge: algo.tag,
  href: algo.href,
  keywords: [algo.id, algo.area, algo.category, algo.tag, algo.cliCommand ?? ''].filter(Boolean),
}));

const DEEP_DIVE_ITEMS: CommandItem[] = DEEP_DIVES.filter((d) => d.status === 'published').map((d) => ({
  id: `deep-dive-${d.id}`,
  category: 'Posts',
  title: d.title,
  subtitle: d.summary,
  badge: d.tag,
  href: d.href,
  keywords: [d.id, d.area, d.category, d.tag, ...(d.highlights || []), ...(d.equations || [])].filter(Boolean),
}));

const PAPER_ITEMS: CommandItem[] = PAPERS.filter((p) => p.status === 'published').map((p) => ({
  id: `paper-${p.id}`,
  category: 'Publications',
  title: p.title,
  subtitle: p.summary,
  badge: p.venue,
  href: p.href,
  keywords: [p.id, p.area, p.category, p.tag, ...(p.authors || []), ...(p.highlights || []), ...(p.equations || [])].filter(Boolean),
}));

let searchIndexCache: CommandItem[] | null = null;
let isFetchingIndex = false;

async function fetchSearchIndex(): Promise<CommandItem[]> {
  if (searchIndexCache) return searchIndexCache;
  if (isFetchingIndex) return [];
  isFetchingIndex = true;

  try {
    const res = await fetch('/search.json');
    if (!res.ok) throw new Error('Search index load failed');
    const data = await res.json();
    const dynamicItems: CommandItem[] = (data.items || []).map((item: any, idx: number) => {
      let category: CommandItem['category'] = 'Publications';
      if (item.type === 'Publication') category = 'Publications';
      else if (item.type === 'Software') category = 'Software';
      else if (item.type === 'Research') category = 'Research';
      else if (item.type === 'Post') category = 'Posts';
      else if (item.type === 'Talk') category = 'Talks';
      else if (item.type === 'News') category = 'News';

      return {
        id: `dyn-${item.type.toLowerCase()}-${idx}`,
        category,
        title: item.title,
        subtitle: item.description,
        badge: item.tags?.[0] || item.type,
        href: item.href,
        keywords: [item.search, ...(item.tags || [])],
      };
    });

    searchIndexCache = dynamicItems;
    isFetchingIndex = false;
    return dynamicItems;
  } catch (err) {
    isFetchingIndex = false;
    return [];
  }
}

export function initCommandPalette() {
  const dialog = document.getElementById('command-palette-dialog') as HTMLDialogElement | null;
  const input = document.getElementById('command-palette-input') as HTMLInputElement | null;
  const resultsContainer = document.getElementById('command-palette-results') as HTMLElement | null;
  const emptyState = document.getElementById('command-palette-empty') as HTMLElement | null;
  const backdrop = document.getElementById('command-palette-backdrop') as HTMLElement | null;
  const closeBtn = document.getElementById('command-palette-close') as HTMLElement | null;

  if (!dialog || !input || !resultsContainer) return;

  let activeIndex = 0;
  let currentFilteredItems: CommandItem[] = [];

  // Pre-fetch search index in background
  fetchSearchIndex();

  function openPalette() {
    if (!dialog) return;
    input!.value = '';
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    renderResults('');
    input!.focus();
  }

  function closePalette() {
    if (!dialog) return;
    dialog.close();
    document.body.style.overflow = '';
  }

  function executeItem(item: CommandItem) {
    closePalette();
    if (item.action) {
      item.action();
    } else if (item.href) {
      window.location.href = item.href;
    }
  }

  function scoreItem(item: CommandItem, queryTokens: string[]): number {
    if (queryTokens.length === 0) return 1;
    const titleLower = item.title.toLowerCase();
    const subtitleLower = (item.subtitle || '').toLowerCase();
    const badgeLower = (item.badge || '').toLowerCase();
    const keywordsLower = (item.keywords || []).join(' ').toLowerCase();

    let score = 0;
    for (const token of queryTokens) {
      if (titleLower.startsWith(token)) score += 100;
      else if (titleLower.includes(` ${token}`)) score += 60;
      else if (titleLower.includes(token)) score += 40;
      else if (badgeLower.includes(token)) score += 30;
      else if (keywordsLower.includes(token)) score += 20;
      else if (subtitleLower.includes(token)) score += 10;
      else return 0; // all tokens must match somewhere
    }
    return score;
  }

  function renderResults(query: string) {
    const tokens = query.toLowerCase().trim().split(/\s+/).filter(Boolean);

    const allBaseItems = [
      ...STATIC_ACTIONS,
      ...ALGORITHM_ITEMS,
      ...DEEP_DIVE_ITEMS,
      ...PAPER_ITEMS,
      ...STATIC_NAV,
      ...(searchIndexCache || []),
    ];

    // Deduplicate by href/id
    const seen = new Set<string>();
    const uniqueItems: CommandItem[] = [];
    for (const it of allBaseItems) {
      const key = it.href || it.id;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueItems.push(it);
      }
    }

    let scored = uniqueItems
      .map((it) => ({ item: it, score: scoreItem(it, tokens) }))
      .filter((entry) => entry.score > 0);

    if (tokens.length > 0) {
      scored.sort((a, b) => b.score - a.score);
    }

    currentFilteredItems = scored.map((s) => s.item).slice(0, 30);
    activeIndex = 0;

    resultsContainer!.replaceChildren();

    if (currentFilteredItems.length === 0) {
      if (emptyState) emptyState.hidden = false;
      return;
    }

    if (emptyState) emptyState.hidden = true;

    // Group items by category
    const categories: Record<string, CommandItem[]> = {};
    for (const it of currentFilteredItems) {
      if (!categories[it.category]) categories[it.category] = [];
      categories[it.category].push(it);
    }

    let globalItemIndex = 0;
    for (const [catName, items] of Object.entries(categories)) {
      const sectionHeader = document.createElement('div');
      sectionHeader.className = 'palette-group-title';
      sectionHeader.textContent = catName;
      resultsContainer!.appendChild(sectionHeader);

      for (const item of items) {
        const itemIdx = globalItemIndex++;
        const itemEl = document.createElement('div');
        itemEl.className = `palette-item ${itemIdx === activeIndex ? 'is-selected' : ''}`;
        itemEl.id = `palette-item-${itemIdx}`;
        itemEl.role = 'option';
        itemEl.setAttribute('aria-selected', String(itemIdx === activeIndex));

        const contentWrap = document.createElement('div');
        contentWrap.className = 'palette-item-main';

        const titleEl = document.createElement('span');
        titleEl.className = 'palette-item-title';
        titleEl.textContent = item.title;
        contentWrap.appendChild(titleEl);

        if (item.subtitle) {
          const subEl = document.createElement('span');
          subEl.className = 'palette-item-subtitle';
          subEl.textContent = item.subtitle;
          contentWrap.appendChild(subEl);
        }

        itemEl.appendChild(contentWrap);

        if (item.badge) {
          const badgeEl = document.createElement('span');
          badgeEl.className = 'palette-item-badge';
          badgeEl.textContent = item.badge;
          itemEl.appendChild(badgeEl);
        }

        const arrowEl = document.createElement('span');
        arrowEl.className = 'palette-item-arrow';
        arrowEl.textContent = '↵';
        itemEl.appendChild(arrowEl);

        itemEl.addEventListener('mouseenter', () => {
          updateActiveIndex(itemIdx);
        });

        itemEl.addEventListener('click', () => {
          executeItem(item);
        });

        resultsContainer!.appendChild(itemEl);
      }
    }
  }

  function updateActiveIndex(nextIdx: number) {
    if (currentFilteredItems.length === 0) return;
    const count = currentFilteredItems.length;
    activeIndex = (nextIdx + count) % count;

    const allItemEls = resultsContainer!.querySelectorAll('.palette-item');
    allItemEls.forEach((el, idx) => {
      const isSelected = idx === activeIndex;
      el.classList.toggle('is-selected', isSelected);
      el.setAttribute('aria-selected', String(isSelected));
      if (isSelected) {
        (el as HTMLElement).scrollIntoView({ block: 'nearest' });
      }
    });
  }

  input.addEventListener('input', () => {
    renderResults(input.value);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      updateActiveIndex(activeIndex + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      updateActiveIndex(activeIndex - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (currentFilteredItems[activeIndex]) {
        executeItem(currentFilteredItems[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closePalette();
    }
  });

  dialog.addEventListener('click', (e) => {
    if (e.target === dialog || e.target === backdrop) {
      closePalette();
    }
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', closePalette);
  }

  // Global key shortcuts: Cmd+K, Ctrl+K, or Slash (/) when not in text input
  function onGlobalKeyDown(e: KeyboardEvent) {
    const target = e.target as HTMLElement | null;
    const isTyping = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (dialog!.open) closePalette();
      else openPalette();
    } else if (e.key === '/' && !isTyping) {
      e.preventDefault();
      openPalette();
    }
  }

  window.addEventListener('keydown', onGlobalKeyDown);

  // Wire search buttons across the page
  document.querySelectorAll('[data-open-command-palette]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      openPalette();
    });
  });

  return () => {
    window.removeEventListener('keydown', onGlobalKeyDown);
  };
}
