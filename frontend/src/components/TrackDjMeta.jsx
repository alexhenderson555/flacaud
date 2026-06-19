import MetaBadge from './MetaBadge';
import { getLibraryTrackFeatures } from '../utils/trackFeatures';

/**
 * BPM + Camelot badges for track rows. Uses cache/DB only unless getFeatures passed.
 */
export default function TrackDjMeta({
  track,
  getFeatures,
  pendingLabel = 'BPM / key…',
  className = '',
}) {
  const resolve = getFeatures || getLibraryTrackFeatures;
  const feat = track ? resolve(track) : null;

  return (
    <div className={`track-dj-meta ${className}`.trim()}>
      {feat ? (
        <>
          <MetaBadge variant="soft">{feat.bpm} BPM</MetaBadge>
          <MetaBadge variant="soft" title={feat.musicalKey}>
            {feat.camelotKey}
          </MetaBadge>
        </>
      ) : (
        <span className="track-dj-meta__pending">{pendingLabel}</span>
      )}
    </div>
  );
}
