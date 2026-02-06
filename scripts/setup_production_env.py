#!/usr/bin/env python3
"""
Generate production .env values.
Usage: python scripts/setup_production_env.py <password>

Outputs the values to fill in .env.production
"""

import secrets
import sys

try:
    from passlib.hash import bcrypt
except ImportError:
    print("Install passlib first: pip install passlib[bcrypt]")
    sys.exit(1)


def main():
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <shared-password>")
        sys.exit(1)

    password = sys.argv[1]

    mongo_password = secrets.token_urlsafe(32)
    jwt_secret = secrets.token_hex(32)
    password_hash = bcrypt.hash(password)

    print("=" * 60)
    print("Production environment values")
    print("=" * 60)
    print()
    print(f"MONGO_USER=licitometro_admin")
    print(f"MONGO_PASSWORD={mongo_password}")
    print(f"MONGO_URL=mongodb://licitometro_admin:{mongo_password}@mongodb:27017/licitaciones_db?authSource=admin")
    print(f"DB_NAME=licitaciones_db")
    print()
    print(f"JWT_SECRET_KEY={jwt_secret}")
    print(f"AUTH_PASSWORD_HASH={password_hash}")
    print(f"TOKEN_EXPIRY_HOURS=24")
    print()
    print(f"ALLOWED_ORIGINS=http://76.13.234.213")
    print()
    print("Copy these values into .env.production on the server.")


if __name__ == "__main__":
    main()
