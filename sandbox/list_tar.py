import tarfile

largest = []
with tarfile.open('app.tar.gz', 'r:gz') as tar:
    for member in tar.getmembers():
        largest.append((member.size, member.name))

largest.sort(reverse=True)
for size, name in largest[:20]:
    print(f"{size / 1024 / 1024:.2f} MB - {name}")
