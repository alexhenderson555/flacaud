
code = open('frontend/src/main.jsx', 'r', encoding='utf-8').read()

imports = '''
import Genreverse from './pages/Genreverse.jsx'
import SetLibrary from './pages/SetLibrary.jsx'
import ShareImport from './pages/ShareImport.jsx'
import VerifyEmail from './pages/VerifyEmail.jsx'
import ForgotPassword from './pages/ForgotPassword.jsx'
import ResetPassword from './pages/ResetPassword.jsx'
import LegalPage from './pages/LegalPage.jsx'
import Landing from './pages/Landing.jsx'
'''

routes = '''
          <Route path="genreverse" element={<Genreverse />} />
          <Route path="set-library" element={<SetLibrary />} />
          <Route path="share-import" element={<ShareImport />} />
          <Route path="verify-email" element={<VerifyEmail />} />
          <Route path="forgot-password" element={<ForgotPassword />} />
          <Route path="reset-password" element={<ResetPassword />} />
          <Route path="legal" element={<LegalPage />} />
          <Route path="landing" element={<Landing />} />
'''

code = code.replace("import App from './App.jsx'", imports + "\nimport App from './App.jsx'")
code = code.replace('<Route path="splitter" element={<StemSplitter />} />', '<Route path="splitter" element={<StemSplitter />} />\n' + routes)

with open('frontend/src/main.jsx', 'w', encoding='utf-8') as f:
    f.write(code)
