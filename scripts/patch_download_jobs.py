import os
code = open('frontend/src/utils/downloadJobs.js', 'r', encoding='utf-8').read()
code = code.replace('fetch(/api/jobs/, {', 'fetch(`/api/jobs/${jobId}`, {')
with open('frontend/src/utils/downloadJobs.js', 'w', encoding='utf-8') as f:
    f.write(code)
