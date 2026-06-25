import codecs
import os

history_dir = r'C:\Users\Alex\AppData\Roaming\Cursor\User\History'

account_candidates = []
app_candidates = []
dict_candidates = []

for root, dirs, filenames in os.walk(history_dir):
    for filename in filenames:
        if filename == 'entries.json': continue
        filepath = os.path.join(root, filename)
        try:
            with codecs.open(filepath, 'r', 'utf-8', errors='ignore') as file:
                content = file.read()
                if 'Cyber Purple' in content and 'Ocean Blue' in content and 'function Account' in content:
                    account_candidates.append((os.path.getmtime(filepath), filepath, content))
                if 'Genreverse' in content and 'Sidebar' in content and 'Transfer Library' in content:
                    app_candidates.append((os.path.getmtime(filepath), filepath, content))
                if "radio: 'Genreverse'" in content and "search: 'Search & Shazam'" in content:
                    dict_candidates.append((os.path.getmtime(filepath), filepath, content))
        except Exception:
            pass

account_candidates.sort(key=lambda x: x[0], reverse=True)
app_candidates.sort(key=lambda x: x[0], reverse=True)
dict_candidates.sort(key=lambda x: x[0], reverse=True)

if account_candidates:
    print('Found Account.jsx backup!')
    with open('frontend/src/pages/Account.jsx', 'w', encoding='utf-8') as f:
        f.write(account_candidates[0][2])
else:
    print('No Account.jsx found in history')

if app_candidates:
    print('Found App.jsx backup!')
    with open('frontend/src/App.jsx', 'w', encoding='utf-8') as f:
        f.write(app_candidates[0][2])
else:
    print('No App.jsx found in history')

if dict_candidates:
    print('Found appDict.js backup!')
    with open('frontend/src/locales/appDict.js', 'w', encoding='utf-8') as f:
        f.write(dict_candidates[0][2])
else:
    print('No appDict.js found in history')
