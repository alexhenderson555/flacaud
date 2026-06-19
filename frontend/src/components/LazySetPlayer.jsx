import { forwardRef, lazy, Suspense } from 'react';
export { canPlaySetUrl } from '../utils/setPlayerUtils';

const SetEmbedPlayer = lazy(() => import('./SetEmbedPlayer'));

const SetPlayer = forwardRef(function SetPlayer(props, ref) {
  return <SetEmbedPlayer ref={ref} {...props} />;
});

const LazySetPlayer = forwardRef(function LazySetPlayer({ fallback = null, url, src, ...props }, ref) {
  const mediaSrc = src || url;
  return (
    <Suspense fallback={fallback}>
      <SetPlayer ref={ref} src={mediaSrc} {...props} />
    </Suspense>
  );
});

export default LazySetPlayer;
