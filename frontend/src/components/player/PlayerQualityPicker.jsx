import { qualityButtonLabel, qualityUnavailableTooltip, isQualityAllowedForPlan, isPlaybackQualityAvailable, isTidalCatalogOnlyLossless } from '../../utils/qualityPrefs';

const QUALITY_OPTIONS = [
  { id: 'HIGH', label: '320k', color: 'rgba(255,255,255,0.4)', level: 1 },
  { id: 'LOSSLESS', label: 'Lossless', level: 2 },
];

export default function PlayerQualityPicker({
  lang,
  effectivePlan,
  qualitiesReady,
  playbackQuality,
  streamQuality,
  availableQualities,
  maxTrackQuality,
  probeData,
  changeQuality,
  appDict
}) {
  const qualityDict = appDict[lang] || appDict.en;
  
  const preferredUnavailable = qualitiesReady && !isPlaybackQualityAvailable(
    playbackQuality,
    availableQualities,
    maxTrackQuality,
    effectivePlan,
    probeData,
  );
  const activeQualityId = preferredUnavailable ? streamQuality : playbackQuality;

  return (
    <div className="player-quality-picker">
      {QUALITY_OPTIONS.map((q) => {
        const planBlocked = !isQualityAllowedForPlan(q.id, effectivePlan);
        const trackBlocked = qualitiesReady && !isPlaybackQualityAvailable(
          q.id,
          availableQualities,
          maxTrackQuality,
          effectivePlan,
          probeData,
        );
        const isDisabled = planBlocked || trackBlocked || !qualitiesReady;
        const tidalCatalogOnly = isTidalCatalogOnlyLossless(probeData);

        return (
          <button
            type="button"
            key={q.id}
            onClick={() => !isDisabled && changeQuality(q.id)}
            data-testid={`quality-${q.id}`}
            data-available={!isDisabled}
            data-tidal-catalog-only={tidalCatalogOnly && q.id === 'LOSSLESS' ? 'true' : undefined}
            disabled={isDisabled}
            className={`player-quality-option${activeQualityId === q.id ? ' is-active' : ''}`}
            style={{
              ...(q.color ? { '--q-color': q.color } : {}),
              opacity: isDisabled ? 0.35 : 1,
            }}
            title={
              !qualitiesReady
                ? (qualityDict.qualityChecking || (lang === 'ru' ? 'Проверка трека…' : 'Checking track…'))
                : isDisabled
                  ? qualityUnavailableTooltip(lang, {
                    planBlocked,
                    tidalCatalogOnly,
                    tier: q.id,
                    dict: qualityDict,
                  })
                  : (maxTrackQuality === q.id ? `${q.label} (max)` : q.label)
            }
          >
            {qualityButtonLabel(q.id, lang)}
          </button>
        );
      })}
    </div>
  );
}
