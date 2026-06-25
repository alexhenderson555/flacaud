code = open('frontend/src/utils/authSession.js', 'r', encoding='utf-8').read()
code = code.replace("fetch(/api/auth/verify-email?token=, { method: 'POST' });", "fetch(`/api/auth/verify-email?token=${token}`, { method: 'POST' });")
with open('frontend/src/utils/authSession.js', 'w', encoding='utf-8') as f:
    f.write(code)
