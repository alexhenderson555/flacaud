import re
content = open('Account-mbDUfmE7.js', 'r', encoding='utf-8').read()
strings = set(re.findall(r'[\'\"].*?[\'\"]', content))
matches = [s for s in strings if 'Blue' in s or 'Purple' in s or 'theme' in s.lower() or 'Genreverse' in s or 'Sunset' in s or 'Neon' in s]
with open('matches.txt', 'w', encoding='utf-8') as f:
    f.write('\n'.join(matches))
