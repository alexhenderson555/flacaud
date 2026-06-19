import json
import os
import re

log_path = r'C:\Users\Alex\.gemini\antigravity\brain\adb775bb-9082-4092-8acd-1d3634396f63\.system_generated\logs\transcript_full.jsonl'

restored = {}

# We look for steps where we got the file contents
# e.g., type == "VIEW_FILE" or type == "RUN_COMMAND" (if we used `type` or `cat`)
with open(log_path, 'r', encoding='utf-8') as f:
    for line in f:
        try:
            data = json.loads(line)
            content = data.get('content', '')
            
            if 'PlayerLogic.jsx' in content and 'import ' in content and 'export ' in content:
                # We found a big chunk of code!
                # Is it a view_file output?
                if 'The following code has been modified to include a line number before every line' in content:
                    lines = content.split('\n')
                    code_lines = []
                    started = False
                    for l in lines:
                        if re.match(r'^\d+:', l):
                            started = True
                            # strip the line number
                            code_lines.append(l.split(':', 1)[1].strip('\r')[1:]) # strip the space after colon
                    if code_lines:
                        restored['PlayerLogic.jsx'] = '\n'.join(code_lines)
                        
            # We can also check for other files
            for t in ['usePlayerQueue.js', 'usePlayerProgressLoop.js', 'usePlayerPersistence.js', 'useAudioSlotPair.js', 'GlobalAudio.jsx', 'App.jsx']:
                if t in content and 'import ' in content and 'export ' in content:
                    if 'The following code has been modified' in content:
                        lines = content.split('\n')
                        code_lines = []
                        for l in lines:
                            if re.match(r'^\d+:', l):
                                code_lines.append(l.split(':', 1)[1].strip('\r')[1:])
                        if code_lines:
                            restored[t] = '\n'.join(code_lines)
        except Exception:
            pass

for k, v in restored.items():
    print(f"Extracted {k} ({len(v)} bytes)")

# Write them back
for k, v in restored.items():
    if k == 'PlayerLogic.jsx':
        path = 'frontend/src/components/player/' + k
    elif 'usePlayer' in k or 'useAudioSlotPair' in k:
        path = 'frontend/src/hooks/' + k
    elif k == 'App.jsx':
        path = 'frontend/src/App.jsx'
    elif k == 'GlobalAudio.jsx':
        path = 'frontend/src/components/player/GlobalAudio.jsx'
    else:
        continue
    
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(v)
    print(f"Restored {path}")
