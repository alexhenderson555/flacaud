import os
import re

base_dir = 'C:/Users/Alex/Cursor/tidal-dl-ru/frontend/src'

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
        
    original = content
    
    # Remove console.log
    content = re.sub(r'console\.log\([^;]+;\n?', '', content)
    
    # Replace alert(...) with showToast(...) unless it contains "coming soon" or "Microphone access is required" (wait, microphone access alert should be toast too)
    # Actually, we can use a callback to conditionally replace
    def alert_replacer(match):
        text = match.group(0)
        if "coming soon" in text.lower():
            return text
        # replace alert with showToast
        return text.replace('alert', 'showToast')
        
    content = re.sub(r'alert\([^\)]+\)', alert_replacer, content)
    
    if content != original:
        # If showToast was added, we need to import it
        if 'showToast' in content and 'import { showToast }' not in content:
            # find where imports end, or just prepend
            # Since relative path differs based on folder:
            rel = os.path.relpath(filepath, base_dir)
            depth = rel.count(os.sep)
            if depth == 0:
                import_path = "./utils/toast"
            else:
                import_path = "../" * depth + "utils/toast"
            
            # Put import after the first line (usually import React)
            lines = content.split('\n')
            for i, line in enumerate(lines):
                if line.startswith('import'):
                    lines.insert(i + 1, f"import {{ showToast }} from '{import_path.replace(os.sep, '/')}';")
                    break
            else:
                lines.insert(0, f"import {{ showToast }} from '{import_path.replace(os.sep, '/')}';")
            content = '\n'.join(lines)
            
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
            
for root, dirs, files in os.walk(base_dir):
    for file in files:
        if file.endswith(('.jsx', '.js')):
            process_file(os.path.join(root, file))
            
# Also inject ToastContainer into App.jsx
app_jsx_path = os.path.join(base_dir, 'App.jsx')
with open(app_jsx_path, 'r', encoding='utf-8') as f:
    app_jsx = f.read()

if 'ToastContainer' not in app_jsx:
    app_jsx = app_jsx.replace("import DownloadToast", "import DownloadToast from './components/DownloadToast';\nimport ToastContainer from './components/ToastContainer';")
    app_jsx = app_jsx.replace("<DownloadToast />", "<ToastContainer />\n      <DownloadToast />")
    with open(app_jsx_path, 'w', encoding='utf-8') as f:
        f.write(app_jsx)

print("Frontend fixed!")
