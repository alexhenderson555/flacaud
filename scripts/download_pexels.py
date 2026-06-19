import urllib.request
import re
import sys

url = 'https://www.pexels.com/search/videos/dj/'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
try:
    html = urllib.request.urlopen(req).read().decode('utf-8')
    links = re.findall(r'https://videos\.pexels\.com/video-files/[^\"]+\.mp4', html)
    if links:
        print('Found link:', links[0])
        urllib.request.urlretrieve(links[0], 'frontend/public/videos/1.mp4')
        print('Downloaded to frontend/public/videos/1.mp4')
    else:
        print('No links found')
except Exception as e:
    print('Error:', e)
