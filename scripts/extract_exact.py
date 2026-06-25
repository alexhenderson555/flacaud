import json
import os
import re

log_path = r'C:\Users\Alex\.gemini\antigravity\brain\adb775bb-9082-4092-8acd-1d3634396f63\.system_generated\logs\transcript_full.jsonl'

restored = {}
target_files = [
    'qualityPrefs.js',
    'usePlayerMediaEffects.js',
    'trackNormalize.js',
    'useLibraryData.js',
    'PlayerLogic.jsx',
    'usePlayerQueue.js',
    'usePlayerProgressLoop.js',
    'usePlayerPersistence.js',
    'useAudioSlotPair.js',
    'GlobalAudio.jsx',
    'App.jsx'
]

with open(log_path, 'r', encoding='utf-8') as f:
    for line in f:
        try:
            data = json.loads(line)
            content = data.get('content', '')
            if data.get('status') == 'DONE' and 'The following code has been modified to include a line number' in content:
                match = re.search(r'File Path: `file:///C:/Users/Alex/Cursor/tidal-dl-ru/([^`]+)`', content)
                if match:
                    filepath = match.group(1)
                    filename = filepath.split('/')[-1]
                    if filename in target_files:
                        lines = content.split('\n')
                        code_lines = []
                        for l in lines:
                            if re.match(r'^\d+:', l):
                                code_lines.append(l.split(':', 1)[1].strip('\r')[1:])
                        if code_lines:
                            new_content = '\n'.join(code_lines)
                            if filename not in restored or len(new_content) > len(restored[filename]):
                                restored[filename] = new_content
        except Exception:
            pass

for k, v in restored.items():
    print(f"Extracted {k} ({len(v)} bytes)")

    path = None
    if k == 'PlayerLogic.jsx':
        path = 'frontend/src/components/player/' + k
    elif 'usePlayer' in k or 'useAudioSlotPair' in k or 'useLibrary' in k:
        path = 'frontend/src/hooks/' + k
    elif k == 'App.jsx':
        path = 'frontend/src/App.jsx'
    elif k == 'GlobalAudio.jsx':
        path = 'frontend/src/components/player/GlobalAudio.jsx'
    elif k in ('qualityPrefs.js', 'trackNormalize.js'):
        path = 'frontend/src/utils/' + k

    if path:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'w', encoding='utf-8') as f:
            f.write(v)
        print(f"Restored {path}")
