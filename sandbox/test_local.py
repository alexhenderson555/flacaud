import httpx

# Tidal search for Adam Port
res = httpx.get("https://openapi.tidal.com/search?query=Adam+Port&type=ARTISTS&limit=1", headers={
    "Authorization": "Bearer 8P93-6o7Q9q9U-x9E-2P" # some default client ID or just use my python script
})
print(res.status_code)
