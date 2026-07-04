"""Per-user library connectors (Spotify, YouTube Music, …).

Each module defines a UserLibraryConnector subclass and calls register_connector().
They are imported lazily via providers.user_library.ensure_connectors_loaded().
"""
