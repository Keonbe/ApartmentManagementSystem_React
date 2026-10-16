// Print only one element (receipt, invoice, contract, report) instead of the
// whole page. The element is copied into #print-root, outside the app, and
// index.css hides everything else while the print dialog is open — so a modal
// prints without the overlay and the page behind it.
let cleanupPending = null;

export async function printElement(node, { variant = 'sheet' } = {}) {
  if (!node) {
    window.print();
    return;
  }
  if (cleanupPending) cleanupPending();

  let printRoot = document.getElementById('print-root');
  if (!printRoot) {
    printRoot = document.createElement('div');
    printRoot.id = 'print-root';
    document.body.appendChild(printRoot);
  }
  printRoot.dataset.variant = variant;
  printRoot.replaceChildren(node.cloneNode(true));

  // Signatures/logos must be loaded before the print snapshot is taken.
  const images = Array.from(printRoot.querySelectorAll('img'));
  await Promise.all(images.map((img) => (img.decode ? img.decode().catch(() => {}) : null)));

  // A blank title keeps the page name out of the browser's print header.
  const prevTitle = document.title;
  let fallbackTimer = null;
  const cleanup = () => {
    window.removeEventListener('afterprint', cleanup);
    clearTimeout(fallbackTimer);
    document.body.classList.remove('print-isolated');
    printRoot.replaceChildren();
    document.title = prevTitle;
    cleanupPending = null;
  };
  cleanupPending = cleanup;

  document.title = '';
  document.body.classList.add('print-isolated');
  window.addEventListener('afterprint', cleanup);
  window.print();
  // window.print() blocks on desktop browsers; mobile ones may return early
  // and never fire afterprint, so clean up eventually either way.
  fallbackTimer = setTimeout(cleanup, 60000);
}
