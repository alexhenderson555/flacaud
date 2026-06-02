import sys

path = 'src/tidal_dl_ru/server/app.py'
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find 'lock = stream_locks[track_id]'
start_idx = -1
for i, l in enumerate(lines):
    if 'lock = stream_locks[track_id]' in l:
        start_idx = i
        break

# Find 'except Exception as e:' matching the try
end_idx = -1
for i in range(start_idx, len(lines)):
    if 'except Exception as e:' in lines[i] and 'raise HTTPException(status_code=500' in lines[i+2]:
        end_idx = i + 2
        break

print(f'Found block from {start_idx} to {end_idx}')

# We will reconstruct this block
original_block = lines[start_idx:end_idx+1]

# Let\'s just use git checkout to reset app.py to the state before my tool call
import subprocess
subprocess.run(['git', 'checkout', '--', path])

with open(path, 'r', encoding='utf-8') as f:
    clean_lines = f.readlines()

for i, l in enumerate(clean_lines):
    if 'lock = stream_locks[track_id]' in l:
        start_idx = i
        break
for i in range(start_idx, len(clean_lines)):
    if 'except Exception as e:' in clean_lines[i] and 'raise HTTPException(status_code=500' in clean_lines[i+2]:
        end_idx = i + 2
        break

# Now rewrite the block to wrap `async with lock:` in `try:`
new_lines = []
new_lines.extend(clean_lines[:start_idx])
new_lines.append('        lock = stream_locks[track_id]\n')
new_lines.append('        try:\n')

# Indent everything from `async with lock:` up to before `try:` by 4 spaces
# Wait, the original code had a `try:` at the same level as `async with lock:`.
# Let\'s just iterate from start_idx+1 to end_idx-3 (before except)
for i in range(start_idx+1, len(clean_lines)):
    if 'except Exception as e:' in clean_lines[i] and clean_lines[i].startswith('        except'):
        # found the end
        new_lines.append(clean_lines[i])
        new_lines.append(clean_lines[i+1])
        new_lines.append(clean_lines[i+2])
        new_lines.extend(clean_lines[i+3:])
        break
    
    line = clean_lines[i]
    if line.strip() == 'try:':
        # skip the original try:
        continue
    # if it\'s inside the old try or old async with, we just ensure it is properly indented under the new try:
    if line.startswith('        ') and not line.startswith('            '):
        # it was at 8 spaces (like `async with lock:` or `if res["type"] == "redirect":`)
        new_lines.append('    ' + line)
    elif line.startswith('            '):
        # it was at 12 spaces
        new_lines.append('    ' + line)
    elif line.startswith('                '):
        new_lines.append('    ' + line)
    elif line.startswith('                    '):
        new_lines.append('    ' + line)
    else:
        # Empty lines or whatever
        if line.strip() == '':
            new_lines.append(line)
        else:
            new_lines.append('    ' + line)

with open(path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print('Fixed app.py successfully.')
