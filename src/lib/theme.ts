/**
 * Utility for unified theme resolution across canvas renderers and components.
 * Returns true if the current active site theme is any dark variant (dark, nord, monokai, cyberdeck).
 */
export function isDarkTheme(themeOrDoc?: string | { getAttribute?: (attr: string) => string | null }): boolean {
  if (typeof themeOrDoc === 'string') {
    return themeOrDoc === 'dark' || themeOrDoc === 'nord' || themeOrDoc === 'monokai' || themeOrDoc === 'cyberdeck';
  }

  let theme: string | null = null;
  if (themeOrDoc && typeof themeOrDoc.getAttribute === 'function') {
    theme = themeOrDoc.getAttribute('data-theme');
  } else if (typeof document !== 'undefined' && document.documentElement) {
    theme = document.documentElement.getAttribute('data-theme') || document.documentElement.dataset.theme || null;
  }

  const resolved = theme || 'light';
  return resolved === 'dark' || resolved === 'nord' || resolved === 'monokai' || resolved === 'cyberdeck';
}

export function getCurrentTheme(themeOrDoc?: string | { getAttribute?: (attr: string) => string | null }):
  | 'light'
  | 'dark'
  | 'nord'
  | 'monokai'
  | 'cyberdeck'
  | 'parchment' {
  if (typeof themeOrDoc === 'string') {
    return (themeOrDoc || 'light') as any;
  }

  let theme: string | null = null;
  if (themeOrDoc && typeof themeOrDoc.getAttribute === 'function') {
    theme = themeOrDoc.getAttribute('data-theme');
  } else if (typeof document !== 'undefined' && document.documentElement) {
    theme = document.documentElement.getAttribute('data-theme') || document.documentElement.dataset.theme || null;
  }

  return (theme || 'light') as any;
}
