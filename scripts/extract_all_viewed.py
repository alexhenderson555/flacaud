import json
import os
import re

log_path = r'C:\Users\Alex\.gemini\antigravity\brain\adb775bb-9082-4092-8acd-1d3634396f63\.system_generated\logs\transcript_full.jsonl'

files = {}
with open(log_path, 'r', encoding='utf-8') as f:
    for line in f:
        if 'VIEW_FILE' in line and 'The following code has been modified' in line:
            try:
                data = json.loads(line)
                content = data.get('content', '')
                if data.get('type') == 'VIEW_FILE' and data.get('status') == 'DONE':
                    match = re.search(r'File Path: `file:///C:/Users/Alex/Cursor/tidal-dl-ru/([^`]+)`', content)
                    if match:
                        filepath = match.group(1)
                        # extract lines
                        lines = content.split('\n')
                        code_lines = []
                        for l in lines:
                            if re.match(r'^\d+:', l):
                                code_lines.append(l.split(':', 1)[1].strip('\r')[1:])

                        # Only keep the longest version of the file in case we viewed it multiple times
                        new_content = '\n'.join(code_lines)
                        if filepath not in files or len(new_content) > len(files[filepath]):
                            files[filepath] = new_content
            except Exception as e:
                print('Error processing line', e)

print('Extracted:', list(files.keys()))
for k, v in files.items():
    os.makedirs(os.path.dirname(k), exist_ok=True)
    with open(k, 'w', encoding='utf-8') as f:
        f.write(v)
    print('Restored', k)
