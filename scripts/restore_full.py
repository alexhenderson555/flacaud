import glob
import json
import os

brain_dir = r'C:\Users\Alex\.gemini\antigravity\brain'

# Get all transcript_full.jsonl and transcript.jsonl from all subagents
transcripts = glob.glob(os.path.join(brain_dir, '*', '.system_generated', 'logs', 'transcript_full.jsonl'))

files_to_restore = [
    'frontend/src/pages/Account.jsx',
    'frontend/src/App.jsx',
    'frontend/src/locales/appDict.js',
    'frontend/src/main.jsx',
    'frontend/src/pages/Search.jsx',
    'frontend/src/pages/Library.jsx',
    'frontend/src/components/ErrorBoundary.jsx',
    'frontend/src/index.css'
]

restored = {k: '' for k in files_to_restore}

for t in transcripts:
    try:
        with open(t, 'r', encoding='utf-8') as f:
            for line in f:
                # We want to catch the file contents from 'view_file' tool responses
                if 'The following code has been modified to include a line number' in line:
                    try:
                        data = json.loads(line)
                        content = data.get('content', '')

                        for file_key in files_to_restore:
                            if f'File Path: `file:///C:/Users/Alex/Cursor/tidal-dl-ru/{file_key}`' in content:
                                lines = content.split('\n')
                                code_lines = []
                                import re
                                for l in lines:
                                    if re.match(r'^\d+:', l):
                                        # strip the line number and the space
                                        code_lines.append(l.split(':', 1)[1].strip('\r')[1:])

                                new_content = '\n'.join(code_lines)
                                # Only take it if it's larger than what we have (to avoid truncated views)
                                if len(new_content) > len(restored[file_key]):
                                    restored[file_key] = new_content
                    except Exception:
                        pass

                # Also try to catch full contents from 'write_to_file'
                if 'default_api:write_to_file' in line:
                    try:
                        data = json.loads(line)
                        calls = data.get('tool_calls', [])
                        for c in calls:
                            func = c.get('function', {})
                            if func.get('name') == 'default_api:write_to_file':
                                args_str = func.get('arguments', '{}')
                                args = json.loads(args_str)
                                target = args.get('TargetFile', '').replace('\\', '/')
                                for file_key in files_to_restore:
                                    if target.endswith(file_key):
                                        content = args.get('CodeContent', '')
                                        if len(content) > len(restored[file_key]):
                                            restored[file_key] = content
                    except Exception:
                        pass
    except Exception:
        pass

for k, v in restored.items():
    if v:
        out_path = os.path.join(r'C:\Users\Alex\Cursor\tidal-dl-ru', k).replace('\\', '/')
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        with open(out_path, 'w', encoding='utf-8') as f:
            f.write(v)
        print(f"Restored {k} ({len(v)} bytes)")
    else:
        print(f"Could not find full content for {k}")

