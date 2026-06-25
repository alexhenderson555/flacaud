import { useEffect, useRef, useState } from 'react';

/** Player bar title — ellipsis by default, slow marquee on hover when truncated. */
export default function PlayerMarqueeTitle({
  className = '',
  title,
  children,
  testId,
}) {
  const ref = useRef(null);
  const [overflow, setOverflow] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => {
      setOverflow(el.scrollWidth > el.clientWidth + 2);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [children]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !overflow) return;
    el.style.setProperty('--marquee-viewport', `${el.clientWidth}px`);
  }, [overflow, children]);

  return (
    <span
      ref={ref}
      data-testid={testId}
      className={`${className}${overflow ? ' player-track-title__text--marquee' : ''}`}
      title={title}
    >
      {overflow ? (
        <span className="player-track-title__marquee-inner">{children}</span>
      ) : (
        children
      )}
    </span>
  );
}
