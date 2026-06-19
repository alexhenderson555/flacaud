import os
import glob
import json

brain_dir = r'C:\Users\Alex\.gemini\antigravity\brain'
transcripts = glob.glob(os.path.join(brain_dir, '*', '.system_generated', 'logs', 'transcript_full.jsonl'))

# Sort transcripts by modification time to process chronologically
transcripts.sort(key=os.path.getmtime)

files_to_track = {
    'frontend/src/pages/Account.jsx': '',
    'frontend/src/App.jsx': ''
}

for log_path in transcripts:
    try:
        with open(log_path, 'r', encoding='utf-8') as f:
            for line in f:
                if 'frontend/src/pages/Account.jsx' in line or 'frontend/src/App.jsx' in line:
                    try:
                        data = json.loads(line)
                        content = data.get('content', '')
                        tool_calls = data.get('tool_calls', [])
                        
                        # Check view_file response
                        if data.get('type') == 'VIEW_FILE' or 'File Path: `file:///C:/Users/Alex/Cursor/tidal-dl-ru/frontend/' in content:
                            if 'The following code has been modified to include a line number' in content:
                                for file_key in files_to_track:
                                    if file_key in content:
                                        lines = content.split('\n')
                                        code_lines = []
                                        for l in lines:
                                            import re
                                            if re.match(r'^\d+:', l):
                                                code_lines.append(l.split(':', 1)[1].strip('\r')[1:])
                                        if len(code_lines) > 0:
                                            files_to_track[file_key] = '\n'.join(code_lines)
                        
                        # Check write_to_file
                        for call in tool_calls:
                            if call.get('function', {}).get('name') == 'default_api:write_to_file':
                                args_str = call.get('function', {}).get('arguments', '{}')
                                args = json.loads(args_str)
                                target = args.get('TargetFile', '')
                                for file_key in files_to_track:
                                    if file_key in target.replace('\\', '/'):
                                        files_to_track[file_key] = args.get('CodeContent', '')
                                        
                        # We won't simulate replace_file_content perfectly unless we write a diff applier,
                        # but let's see what we get from view and write first.
                    except Exception:
                        pass
    except Exception as e:
        pass

for k, v in files_to_track.items():
    print(f"File: {k}, size: {len(v)} bytes")
    if len(v) > 0:
        with open('restored_' + os.path.basename(k), 'w', encoding='utf-8') as f:
            f.write(v)

