import re

with open("frontend/src/hooks/usePlayerQueue.js", "r", encoding="utf-8") as f:
    code = f.read()

begin_old = r"""    clearAudioElementSrc\(main\);
    setCurrentAudioSrc\?\.\(''\);
    unlockPlaybackElement\(main\);"""

begin_new = """    clearAudioElementSrc(main);
    setCurrentAudioSrc?.('');
    unlockPlaybackElement(main);
    const pre = getPreloadAudioEl?.() ?? preloadAudioRef?.current;
    if (pre) unlockPlaybackElement(pre);"""

code = re.sub(begin_old, begin_new, code)

toggle_old = r"""      pauseSetEmbed\?\.\(\);
      releaseSetEmbed\?\.\(\);
      initAudioEngine\(\);
      resumePausedPlayback\(main, \{"""

toggle_new = """      pauseSetEmbed?.();
      releaseSetEmbed?.();
      initAudioEngine();
      unlockPlaybackElement(main);
      const pre = getPreloadAudioEl?.() ?? preloadAudioRef?.current;
      if (pre) unlockPlaybackElement(pre);
      resumePausedPlayback(main, {"""

code = re.sub(toggle_old, toggle_new, code)

with open("frontend/src/hooks/usePlayerQueue.js", "w", encoding="utf-8") as f:
    f.write(code)
