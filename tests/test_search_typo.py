from tidal_dl_ru.server.search_typo import (
    fix_keyboard_layout,
    suggest_layout,
    suggest_mangled_suffix,
    suggest_search_query,
    suggest_spelling,
    suggest_trim_suffix_search,
)


def test_layout_ghbdtn():
    assert fix_keyboard_layout("ghbdtn") == "привет"
    assert suggest_layout("ghbdtn") == "привет"


def test_layout_en_on_ru_keyboard_multiword():
    assert suggest_layout("ьфщк дфяук") == "maor lazer"
    assert suggest_search_query("ьфщк дфяук") == ("Major Lazer", "layout")


def test_spelling_radiohead():
    assert suggest_spelling("radhead") == "Radiohead"


def test_no_suggestion_for_valid():
    assert suggest_search_query("Daft Punk") == (None, None)


def test_mangled_suffix_shimza():
    assert suggest_mangled_suffix("shimzadfgfdgd", ("Shimza",)) == "Shimza"


def test_trim_suffix_search():
    def fake_search(q, limit, offset):
        return (["hit"], False) if q == "shimza" else ([], False)

    assert suggest_trim_suffix_search("shimzadfgfdgd", fake_search) == "shimza"
