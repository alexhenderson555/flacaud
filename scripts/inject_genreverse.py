import json

with open("subgenres.json", "r", encoding="utf-8") as f:
    subs = json.load(f)

genre_icons = {
  "Electronic": "Cpu",
  "Rock": "Guitar",
  "Metal": "Flame",
  "Hip-Hop / Rap": "Mic2",
  "Pop": "Star",
  "R&B / Soul": "Heart",
  "Jazz & Blues": "Music",
  "Latin": "Sun",
  "Classical": "Feather",
  "Country & Folk": "Tent",
  "Global & World": "Globe",
  "Chill & Focus": "Coffee"
}

out = "const GENRE_UNIVERSE = [\n"
for gname, icon in genre_icons.items():
    if gname == "Electronic": gid = "electronic"
    elif gname == "Rock": gid = "rock"
    elif gname == "Metal": gid = "metal"
    elif gname == "Hip-Hop / Rap": gid = "hiphop"
    elif gname == "Pop": gid = "pop"
    elif gname == "R&B / Soul": gid = "rnb"
    elif gname == "Jazz & Blues": gid = "jazz"
    elif gname == "Latin": gid = "latin"
    elif gname == "Classical": gid = "classical"
    elif gname == "Country & Folk": gid = "country"
    elif gname == "Global & World": gid = "world"
    elif gname == "Chill & Focus": gid = "ambient"

    out += f"  {{\n    id: '{gid}',\n    name: '{gname}',\n    icon: {icon},\n    subgenres: [\n"
    for sub in subs[gname]:
        img = f"'{sub['image']}'" if sub['image'] else "null"
        out += f"      {{ name: '{sub['name']}', image: {img} }},\n"
    out += "    ]\n  },\n"
out += "];\n"

with open("scripts/new_universe.txt", "w", encoding="utf-8") as f:
    f.write(out)
