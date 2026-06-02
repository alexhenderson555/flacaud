from tidal_dl_ru.providers.tidal.client import TidalClient
from pprint import pprint

def main():
    client = TidalClient()
    res = client.get_track("20115568")
    pprint(res)

if __name__ == "__main__":
    main()
