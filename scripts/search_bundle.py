import re
content = open('old_bundle.js', 'r', encoding='utf-8').read()
themes = re.findall(r'theme[A-Za-z]+:\s*[\'\"].*?[\'\"]', content)
print('Themes found:', set(themes))
if 'Genreverse' in content:
    print('Genreverse IS in the bundle')
else:
    print('Genreverse IS NOT in the bundle')
