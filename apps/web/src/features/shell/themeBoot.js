/**
 * The theme bootstrap script, inlined into <head> so the correct theme is on
 * <html> before first paint and there is no flash of the wrong one.
 *
 * Plain JavaScript, not TypeScript, and deliberately its own module: the
 * production server needs the exact same string to compute the CSP hash that
 * allows this one inline script. Keeping a second copy anywhere would mean a
 * silent CSP failure the moment one of them was edited.
 */
export const themeBootScript = `(function(){try{var t=localStorage.getItem('theme');if(!t)t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.classList.toggle('dark',t==='dark');}catch(e){}})();`;
