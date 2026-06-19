#!/usr/bin/env python3
"""Create Marzban users (run: docker compose exec -T marzban python3 /tmp/create_users.py 10 1)"""
import sys

from app.db import GetDB, crud
from app.models.proxy import ProxyTypes
from app.models.user import UserCreate, UserStatus


def main() -> None:
    count = int(sys.argv[1]) if len(sys.argv) > 1 else 10
    start = int(sys.argv[2]) if len(sys.argv) > 2 else 1
    names = []
    with GetDB() as db:
        admin = crud.get_admin(db, "admin")
        if not admin:
            raise SystemExit("admin not found")
        for i in range(start, start + count):
            username = f"key-{i}"
            if crud.get_user(db, username):
                names.append(username)
                continue
            user = UserCreate(
                username=username,
                status=UserStatus.active,
                proxies={ProxyTypes.VLESS: {}},
            )
            dbuser = crud.create_user(db, user, admin)
            # CLI-created users must not exclude default inbounds (breaks subscription).
            for proxy in crud.get_user_proxies(db, dbuser):
                crud.remove_proxy_inbound(db, proxy, "VLESS TCP REALITY")
            names.append(username)
    print(",".join(names))


if __name__ == "__main__":
    main()
