import glob
import json
import os

files = {}
targets = [
    'PlayerLogic.jsx',
    'usePlayerQueue.js',
    'usePlayerProgressLoop.js',
    'usePlayerPersistence.js',
    'useAudioSlotPair.js',
    'App.jsx'
]

brain_dir = r'C:\Users\Alex\.gemini\antigravity\brain'
log_paths = glob.glob(os.path.join(brain_dir, '*', '.system_generated', 'logs', 'transcript_full.jsonl'))

for log_path in sorted(log_paths, key=os.path.getmtime):
    print(f"Scanning {log_path}...")
    with open(log_path, 'r', encoding='utf-8') as f:
        for line in f:
            try:
                data = json.loads(line)
                for call in data.get('tool_calls', []):
                    if call.get('function') in ('write_to_file', 'replace_file_content', 'multi_replace_file_content', 'default_api:write_to_file', 'default_api:replace_file_content', 'default_api:multi_replace_file_content'):
                        args = call.get('arguments', {})
                        target = args.get('TargetFile', '')
                        for t in targets:
                            if t in target:
                                if target not in files:
                                    files[target] = []
                                files[target].append((call.get('function'), args))
            except Exception:
                pass

print("Scan complete.")
for path, history in files.items():
    print(f'Found {len(history)} operations for {path}')

file_states = {}
for path, history in files.items():
    current_content = ""
    for func, args in history:
        if func in ('write_to_file', 'default_api:write_to_file'):
            if args.get('CodeContent'):
                current_content = args.get('CodeContent')
        elif func in ('replace_file_content', 'default_api:replace_file_content'):
            target_content = args.get('TargetContent', '')
            replacement_content = args.get('ReplacementContent', '')
            if target_content in current_content:
                current_content = current_content.replace(target_content, replacement_content)
        elif func in ('multi_replace_file_content', 'default_api:multi_replace_file_content'):
            for chunk in args.get('ReplacementChunks', []):
                target_content = chunk.get('TargetContent', '')
                replacement_content = chunk.get('ReplacementContent', '')
                if target_content in current_content:
                    current_content = current_content.replace(target_content, replacement_content)
    file_states[path] = current_content

for path, content in file_states.items():
    if content:
        try:
            clean_path = path
            if 'frontend' in path:
                clean_path = 'frontend' + path.split('frontend')[1]
            else:
                # If path doesn't contain frontend, might be absolute from other OS
                if 'PlayerLogic.jsx' in path:
                    clean_path = 'frontend/src/components/player/PlayerLogic.jsx'
                elif 'usePlayer' in path or 'useAudioSlotPair' in path:
                    clean_path = 'frontend/src/hooks/' + path.split('/')[-1].split('\\')[-1]
                elif 'App.jsx' in path:
                    clean_path = 'frontend/src/App.jsx'

            os.makedirs(os.path.dirname(clean_path), exist_ok=True)
            with open(clean_path, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f'Restored {clean_path}')
        except Exception as e:
            print(f'Error writing {path}: {e}')
