import glob
import json
import os

brain_dir = r'C:\Users\Alex\.gemini\antigravity\brain'

transcripts = glob.glob(os.path.join(brain_dir, '*', '.system_generated', 'logs', 'transcript_full.jsonl'))
transcripts.sort(key=os.path.getmtime)

wiped_files = [
    'frontend/src/pages/Search.jsx',
    'frontend/src/pages/Account.jsx',
    'frontend/src/pages/Library.jsx',
    'frontend/src/App.jsx',
    'frontend/src/main.jsx',
    'frontend/src/components/ErrorBoundary.jsx',
    'frontend/src/index.css',
    'frontend/src/locales/appDict.js'
]

file_states = {}
for wf in wiped_files:
    path = os.path.join(r'C:\Users\Alex\Cursor\tidal-dl-ru', wf).replace('\\', '/')
    try:
        with open(path, 'r', encoding='utf-8') as f:
            file_states[path] = f.read()
    except Exception:
        file_states[path] = ''

def normalize_path(p):
    return p.replace('\\', '/')

def apply_replace(content, target_content, replacement_content):
    if target_content in content:
        return content.replace(target_content, replacement_content, 1)
    else:
        return content

for transcript in transcripts:
    if transcript == transcripts[-1]:
        break # don't replay the current active agent session

    with open(transcript, 'r', encoding='utf-8') as f:
        for line in f:
            try:
                data = json.loads(line)
                calls = data.get('tool_calls', [])
                for call in calls:
                    func = call.get('function', {})
                    name = func.get('name')
                    if name in ['default_api:write_to_file', 'default_api:replace_file_content', 'default_api:multi_replace_file_content']:
                        args_str = func.get('arguments', '{}')
                        args = json.loads(args_str)
                        target = normalize_path(args.get('TargetFile', ''))

                        match_key = None
                        for k in file_states:
                            if target.endswith(k.split('tidal-dl-ru/')[-1]):
                                match_key = k
                                break

                        if match_key:
                            if name == 'default_api:write_to_file':
                                file_states[match_key] = args.get('CodeContent', '')
                            elif name == 'default_api:replace_file_content':
                                file_states[match_key] = apply_replace(
                                    file_states[match_key],
                                    args.get('TargetContent', ''),
                                    args.get('ReplacementContent', '')
                                )
                            elif name == 'default_api:multi_replace_file_content':
                                chunks = args.get('ReplacementChunks', [])
                                for chunk in chunks:
                                    file_states[match_key] = apply_replace(
                                        file_states[match_key],
                                        chunk.get('TargetContent', ''),
                                        chunk.get('ReplacementContent', '')
                                    )
            except Exception:
                pass

for k, v in file_states.items():
    if v:
        with open(k, 'w', encoding='utf-8') as f:
            f.write(v)
        print(f'Restored {k} ({len(v)} bytes)')
