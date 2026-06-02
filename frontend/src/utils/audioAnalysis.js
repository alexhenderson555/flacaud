import MusicTempo from 'music-tempo';

const majorProfile = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const minorProfile = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function correlate(chroma, profile) {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += chroma[i] * profile[i];
  }
  return sum;
}

export async function analyzeAudioBuffer(audioBuffer) {
  const sampleRate = audioBuffer.sampleRate;
  let audioData = [];
  
  if (audioBuffer.numberOfChannels === 2) {
    const channel1Data = audioBuffer.getChannelData(0);
    const channel2Data = audioBuffer.getChannelData(1);
    const length = channel1Data.length;
    for (let i = 0; i < length; i++) {
      audioData[i] = (channel1Data[i] + channel2Data[i]) / 2;
    }
  } else {
    audioData = Array.from(audioBuffer.getChannelData(0));
  }
  
  // Use first 30 seconds for speed
  const maxSamples = Math.min(audioData.length, sampleRate * 30);
  const slicedData = audioData.slice(0, maxSamples);
  
  // 1. BPM Detection using music-tempo
  const mt = new MusicTempo(slicedData);
  let bpm = Math.round(mt.tempo);
  
  // Normalization for common DJ ranges (e.g., 70-150)
  if (bpm > 160) bpm = Math.round(bpm / 2);
  if (bpm < 70) bpm = Math.round(bpm * 2);

  // 2. Key Detection using OfflineAudioContext + Chromagram
  const offlineCtx = new OfflineAudioContext(1, slicedData.length, sampleRate);
  const source = offlineCtx.createBufferSource();
  const tempBuffer = offlineCtx.createBuffer(1, slicedData.length, sampleRate);
  tempBuffer.copyToChannel(new Float32Array(slicedData), 0);
  source.buffer = tempBuffer;

  const analyser = offlineCtx.createAnalyser();
  analyser.fftSize = 8192;
  
  const processor = offlineCtx.createScriptProcessor(8192, 1, 1);
  const chromagram = new Array(12).fill(0);
  const freqs = new Float32Array(analyser.frequencyBinCount);
  
  source.connect(analyser);
  analyser.connect(processor);
  processor.connect(offlineCtx.destination);
  
  processor.onaudioprocess = () => {
    analyser.getFloatFrequencyData(freqs);
    for (let i = 0; i < freqs.length; i++) {
      const freq = i * sampleRate / analyser.fftSize;
      if (freq > 27.5 && freq < 4186) { // Piano range (A0 to C8)
        const pitch = 69 + 12 * Math.log2(freq / 440);
        const pitchClass = Math.round(pitch) % 12;
        if (pitchClass >= 0 && pitchClass < 12 && isFinite(freqs[i])) {
            const energy = Math.pow(10, freqs[i] / 20); // dB to linear
            chromagram[pitchClass] += energy;
        }
      }
    }
  };
  
  source.start(0);
  await offlineCtx.startRendering();
  
  // Determine best matching key
  let maxCorr = -Infinity;
  let bestKey = 'C';
  
  for (let shift = 0; shift < 12; shift++) {
    // Shift the profiles (or the chromagram)
    // We shift the profile to match the tonic
    const shiftedMajor = [];
    const shiftedMinor = [];
    for (let i = 0; i < 12; i++) {
      shiftedMajor.push(majorProfile[(i - shift + 12) % 12]);
      shiftedMinor.push(minorProfile[(i - shift + 12) % 12]);
    }
    
    const corrMajor = correlate(chromagram, shiftedMajor);
    const corrMinor = correlate(chromagram, shiftedMinor);
    
    if (corrMajor > maxCorr) {
      maxCorr = corrMajor;
      bestKey = notes[shift]; // major
    }
    if (corrMinor > maxCorr) {
      maxCorr = corrMinor;
      bestKey = notes[shift] + 'm'; // minor
    }
  }
  
  return { bpm, key: bestKey };
}
