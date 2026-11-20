import { useCallback, useEffect, useRef, useState } from 'react';

// Chat scrolling (every chat: the widget, Messages, the Inquiries window).
// A new message keeps the view at the bottom only while the reader is there;
// once they scroll up to read older messages it stays put and a "Latest" button
// appears (with how many came in meanwhile) to jump back down.
//   const { ref, atBottom, unseen, onScroll, toBottom } = useChatScroll(messages.length, resetKey);
//   <div ref={ref} onScroll={onScroll} className="overflow-y-auto">…</div>
//   {!atBottom && <JumpToLatest (Components/chat/JumpToLatest.jsx) count={unseen} onClick={toBottom} label={t('chat.latest')} />}
const NEAR_BOTTOM_PX = 120;

export default function useChatScroll(count, resetKey) {
  const ref = useRef(null);
  const [atBottom, setAtBottom] = useState(true);
  const [unseen, setUnseen] = useState(0);
  const lastCount = useRef(count);
  const stick = useRef(true);

  const toBottom = useCallback((smooth = true) => {
    const el = ref.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    stick.current = true;
    setAtBottom(true);
    setUnseen(0);
  }, []);

  const onScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    stick.current = near;
    setAtBottom(near);
    if (near) setUnseen(0);
  }, []);

  // Another conversation (or the chat reopened): start at the bottom.
  useEffect(() => {
    stick.current = true;
    lastCount.current = 0;
    const frame = requestAnimationFrame(() => toBottom(false));
    return () => cancelAnimationFrame(frame);
  }, [resetKey, toBottom]);

  // New messages: follow them only when the reader is at the bottom.
  useEffect(() => {
    const added = count - lastCount.current;
    lastCount.current = count;
    if (added <= 0) return undefined;
    if (stick.current) {
      const frame = requestAnimationFrame(() => toBottom(lastCount.current !== added));
      return () => cancelAnimationFrame(frame);
    }
    setUnseen((n) => n + added);
    return undefined;
  }, [count, toBottom]);

  return { ref, atBottom, unseen, onScroll, toBottom };
}
