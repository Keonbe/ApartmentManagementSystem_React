import { useEffect, useRef } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Open dialogs, oldest first. Only the last one (on top) reacts to Esc and Tab,
// so Esc in a dialog opened from another dialog closes just that one. The page
// behind stays still while any dialog is open.
const stack = [];
let savedOverflow = '';

function lockScroll() {
  if (stack.length === 1) {
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
}

function unlockScroll() {
  if (stack.length === 0) document.body.style.overflow = savedOverflow;
}

// How many dialogs are already open. Read on a dialog's first render (before it
// joins the stack), it is that dialog's depth: Modal stacks z-index with it so
// no page has to pick numbers.
export function openDialogCount() {
  return stack.length;
}

// Keyboard behaviour for a modal: focus moves into it on open (the first
// focusable element, or one marked data-autofocus), Tab stays inside it, Esc
// calls onClose, and focus returns to what had it before. Put the returned
// ref on the dialog card, next to role="dialog" aria-modal="true". Pass
// externalRef when the caller also needs the card node (e.g. to print it).
export default function useDialog(isOpen, onClose, externalRef) {
  const ownRef = useRef(null);
  const ref = externalRef || ownRef;
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    if (!isOpen) return undefined;
    const token = {};
    stack.push(token);
    lockScroll();
    const previous = document.activeElement;
    const node = ref.current;
    // Only what can take focus now: a control hidden at this width (e.g. a
    // phone-only close button) would swallow the initial focus and break the Tab loop.
    const items = () => (node ? [...node.querySelectorAll(FOCUSABLE)].filter(el => el.getClientRects().length > 0) : []);
    (node?.querySelector('[data-autofocus]') || items()[0] || node)?.focus();

    const onKey = (e) => {
      if (stack[stack.length - 1] !== token) return; // a dialog above this one handles it
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current?.();
      } else if (e.key === 'Tab') {
        const list = items();
        if (list.length === 0) { e.preventDefault(); return; }
        const first = list[0];
        const last = list[list.length - 1];
        if (!node.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
        else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const i = stack.indexOf(token);
      if (i >= 0) stack.splice(i, 1);
      unlockScroll();
      previous?.focus?.();
    };
  }, [isOpen, ref]);

  return ref;
}
