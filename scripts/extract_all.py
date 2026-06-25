import glob
import json
import os
import re

brain_dir = r'C:\Users\Alex\.gemini\antigravity\brain'
transcripts = glob.glob(os.path.join(brain_dir, '*', '.system_generated', 'logs', 'transcript_full.jsonl'))

restored = {}

for log_path in transcripts:
    try:
        with open(log_path, 'r', encoding='utf-8') as f:
            for line in f:
                if 'VIEW_FILE' in line and 'The following code has been modified to include a line number' in line:
                    try:
                        data = json.loads(line)
                        if data.get('type') != 'VIEW_FILE' or data.get('status') != 'DONE':
                            continue
                        content = data.get('content', '')
                        match = re.search(r'File Path: `file:///C:/Users/Alex/Cursor/tidal-dl-ru/([^`]+)`', content)
                        if match:
                            filepath = match.group(1).replace('\\', '/')
                            if not filepath.startswith('frontend/'):
                                continue

                            lines = content.split('\n')
                            code_lines = []
                            for l in lines:
                                if re.match(r'^\d+:', l):
                                    code_lines.append(l.split(':', 1)[1].strip('\r')[1:])

                            new_content = '\n'.join(code_lines)

                            # Keep the version with the MAXIMUM lines because some views were truncated!
                            if filepath not in restored or len(new_content) > len(restored[filepath]):
                                restored[filepath] = new_content
                    except Exception:
                        pass
    except Exception as e:
        print(f"Error reading {log_path}: {e}")

print(f"Found {len(restored)} files to restore in frontend/")

for k, v in restored.items():
    # Only write if it's inside frontend/
    if k.startswith('frontend/'):
        target_path = os.path.join('C:/Users/Alex/Cursor/tidal-dl-ru', k)
        os.makedirs(os.path.dirname(target_path), exist_ok=True)
        with open(target_path, 'w', encoding='utf-8') as f:
            f.write(v)
        print(f"Restored: {k} ({len(v)} bytes)")
