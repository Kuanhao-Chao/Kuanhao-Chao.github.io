export interface WgtExplorerReset {
  base?: string;
  node?: string;
}

export interface WgtGraphExplorerApi {
  reset: (selection?: WgtExplorerReset) => void;
}

type ExplorerRoot = HTMLElement & {
  _wgi?: { stop: () => void };
  _wgtExplorer?: WgtGraphExplorerApi;
};

export function mountWgtGraphExplorer(root: ExplorerRoot): WgtGraphExplorerApi | null {
  if (root.dataset.wgtExplorerBound === 'true') return root._wgtExplorer ?? null;
  root.dataset.wgtExplorerBound = 'true';

  const baseButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-wgt-base]'));
  const nodeElements = Array.from(root.querySelectorAll<SVGElement>('[data-wgt-node]'));
  const edgeElements = Array.from(root.querySelectorAll<SVGElement>('[data-wgt-edge]'));
  const detail = root.querySelector<HTMLElement>('[data-wgt-detail]');
  if (!baseButtons.length || !detail) return null;
  const detailElement = detail;

  let activeBase = 'all';
  let activeNode = '';

  const interruptPlayback = () => root._wgi?.stop();

  function render() {
    const focusedEdges = edgeElements.filter((edge) => {
      if (activeNode) return edge.dataset.from === activeNode || edge.dataset.to === activeNode;
      return activeBase !== 'all' && edge.dataset.base === activeBase;
    });
    const relatedNodes = new Set<string>();
    focusedEdges.forEach((edge) => {
      if (edge.dataset.from) relatedNodes.add(edge.dataset.from);
      if (edge.dataset.to) relatedNodes.add(edge.dataset.to);
    });

    baseButtons.forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.wgtBase === activeBase && !activeNode));
    });
    edgeElements.forEach((edge) => {
      const focused = focusedEdges.includes(edge);
      const hasFocus = Boolean(activeNode || activeBase !== 'all');
      edge.classList.toggle('is-focused', focused);
      edge.classList.toggle('is-muted', hasFocus && !focused);
    });
    nodeElements.forEach((node) => {
      const nodeId = node.dataset.wgtNode ?? '';
      const selected = nodeId === activeNode;
      const related = relatedNodes.has(nodeId);
      const hasFocus = Boolean(activeNode || activeBase !== 'all');
      node.classList.toggle('is-selected', selected);
      node.classList.toggle('is-related', related && !selected);
      node.classList.toggle('is-muted', hasFocus && !selected && !related);
      node.setAttribute('aria-pressed', String(selected));
    });

    if (activeNode) {
      detailElement.textContent = nodeElements.find((node) => node.dataset.wgtNode === activeNode)?.dataset.detail ?? '';
    } else {
      detailElement.textContent = baseButtons.find((button) => button.dataset.wgtBase === activeBase)?.dataset.summary ?? '';
    }
  }

  baseButtons.forEach((button) => {
    button.addEventListener('click', () => {
      interruptPlayback();
      activeBase = button.dataset.wgtBase ?? 'all';
      activeNode = '';
      render();
    });
  });

  nodeElements.forEach((node) => {
    const selectNode = () => {
      interruptPlayback();
      const nodeId = node.dataset.wgtNode ?? '';
      activeNode = activeNode === nodeId ? '' : nodeId;
      activeBase = 'all';
      render();
    };
    node.addEventListener('click', selectNode);
    node.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      selectNode();
    });
  });

  const api: WgtGraphExplorerApi = {
    reset(selection = {}) {
      activeBase = selection.base ?? 'all';
      activeNode = selection.node ?? '';
      render();
    },
  };
  root._wgtExplorer = api;
  api.reset();
  return api;
}
