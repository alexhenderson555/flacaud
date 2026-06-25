code = open('frontend/src/index.css', 'r', encoding='utf-8').read()

code += '''
}
'''
with open('frontend/src/index.css', 'w', encoding='utf-8') as f:
    f.write(code)
