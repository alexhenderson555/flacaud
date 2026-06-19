import { usePlayer } from '../../store/usePlayerStore';

/** Mount point for the global set embed (analyzer or library row). */
export default function SetEmbedAnchor({ className, style, children, testId }) {
  const { registerSetEmbedAnchor } = usePlayer();

  return (
    <div
      ref={registerSetEmbedAnchor}
      className={className}
      style={style}
      data-testid={testId}
    >
      {children}
    </div>
  );
}

