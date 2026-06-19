import os
import glob

brain_dir = r'C:\Users\Alex\.gemini\antigravity\brain'
transcripts = glob.glob(os.path.join(brain_dir, '*', '.system_generated', 'logs', 'transcript.jsonl'))
transcripts.sort(key=os.path.getmtime)

for t in transcripts:
    print(os.path.getmtime(t), t)
