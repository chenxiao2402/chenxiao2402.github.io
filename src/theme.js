// Apply the saved preference before paint. With JS disabled, CSS follows the OS.
try {
  const saved = localStorage.getItem('xiao-theme');
  if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved;
} catch { /* Storage can be disabled in a private browser. */ }
