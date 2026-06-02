import os, re
issues = []
patterns = {
    'TODO': re.compile(r'TODO\b', re.I),
    'FIXME': re.compile(r'FIXME\b', re.I),
    'alert': re.compile(r'alert\('),
    'coming soon': re.compile(r'coming soon', re.I),
    'mock url': re.compile(r'mock'),
    'console.log': re.compile(r'console\.log')
}

base_dir = 'C:/Users/Alex/Cursor/tidal-dl-ru'
for root, dirs, files in os.walk(base_dir):
    if '.venv' in root or 'node_modules' in root or '.git' in root or '__pycache__' in root or 'dist' in root:
        continue
    for file in files:
        if not file.endswith(('.js', '.jsx', '.py', '.ts', '.tsx')):
            continue
        filepath = os.path.join(root, file)
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                lines = f.readlines()
            for i, line in enumerate(lines):
                for label, pat in patterns.items():
                    if pat.search(line):
                        issues.append(f'{label} in {os.path.relpath(filepath, base_dir)} line {i+1}: {line.strip()}')
        except Exception:
            pass

for issue in issues:
    print(issue)
