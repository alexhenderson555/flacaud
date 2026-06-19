import base64

from tidal_dl_ru.providers.tidal.download import manifest_lossless_meta
from tidal_dl_ru.providers.tidal.models import PlaybackManifest


def test_dash_audio_sampling_rate_when_api_fields_missing():
    xml = (
        '<?xml version="1.0"?>'
        '<MPD xmlns="urn:mpeg:dash:schema:mpd:2011"><Period><AdaptationSet>'
        '<Representation codecs="flac" audioSamplingRate="44100">'
        '<SegmentTemplate media="a.flac" initialization="i.flac" startNumber="1"/>'
        "</Representation></AdaptationSet></Period></MPD>"
    )
    manifest = PlaybackManifest(
        trackId=1,
        audioQuality="HI_RES_LOSSLESS",
        manifestMimeType="application/dash+xml",
        manifest=base64.b64encode(xml.encode()).decode(),
    )
    sr, bd = manifest_lossless_meta(manifest)
    assert sr == 44100
    assert bd is None


def test_api_fields_take_precedence():
    manifest = PlaybackManifest(
        trackId=1,
        audioQuality="HI_RES_LOSSLESS",
        manifestMimeType="application/dash+xml",
        manifest=base64.b64encode(b"<MPD/>").decode(),
        sampleRate=96000,
        bitDepth=24,
    )
    sr, bd = manifest_lossless_meta(manifest)
    assert sr == 96000
    assert bd == 24
