import re

try:
    content = open('Account-mbDUfmE7.js', 'r', encoding='utf-8').read()

    themes = re.findall(r'id:\s*[\'\"].*?[\'\"],\s*label:\s*.*?[,}],?\s*color:\s*[\'\"].*?[\'\"]', content)
    if themes:
        print('Themes found:')
        for t in themes: print(t)
    else:
        print('No themes matched regex 1')

    themes2 = re.findall(r'[\'\"]theme[A-Za-z]+[\'\"]:\s*[\'\"].*?[\'\"]', content)
    if themes2:
        print('Themes matched regex 2:')
        for t in themes2: print(t)

except Exception as e:
    print('Error:', e)
