code = open('frontend/src/pages/Landing.jsx', 'r', encoding='utf-8').read()

code += '''
      </main>
    </div>
  );
}
'''
with open('frontend/src/pages/Landing.jsx', 'w', encoding='utf-8') as f:
    f.write(code)
