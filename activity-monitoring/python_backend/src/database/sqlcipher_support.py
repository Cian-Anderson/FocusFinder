from __future__ import annotations

import ctypes
import os
import secrets
import shutil
from ctypes import wintypes
from pathlib import Path
from typing import Optional, Tuple

from sqlalchemy import create_engine
from sqlalchemy.pool import NullPool


def _load_dbapi():
    try:
        import sqlcipher3 as dbapi  # type: ignore

        return dbapi
    except Exception:
        try:
            import pysqlcipher3.dbapi2 as dbapi  # type: ignore

            return dbapi
        except Exception:
            return None


def _sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def _sqlcipher_key_file(db_path: Path) -> Path:
    return db_path.parent / ".sqlcipher_key"


class _DataBlob(ctypes.Structure):
    _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_byte))]


def _protect_data(data: bytes) -> bytes:
    if os.name != "nt":
        return data

    crypt32 = ctypes.windll.crypt32
    kernel32 = ctypes.windll.kernel32

    in_buffer = ctypes.create_string_buffer(data, len(data))
    in_blob = _DataBlob(len(data), ctypes.cast(in_buffer, ctypes.POINTER(ctypes.c_byte)))
    out_blob = _DataBlob()

    CRYPTPROTECT_LOCAL_MACHINE = 0x4
    if not crypt32.CryptProtectData(
        ctypes.byref(in_blob),
        None,
        None,
        None,
        None,
        CRYPTPROTECT_LOCAL_MACHINE,
        ctypes.byref(out_blob),
    ):
        raise ctypes.WinError()

    try:
        return ctypes.string_at(out_blob.pbData, out_blob.cbData)
    finally:
        kernel32.LocalFree(out_blob.pbData)


def _unprotect_data(data: bytes) -> bytes:
    if os.name != "nt":
        return data

    crypt32 = ctypes.windll.crypt32
    kernel32 = ctypes.windll.kernel32

    in_buffer = ctypes.create_string_buffer(data, len(data))
    in_blob = _DataBlob(len(data), ctypes.cast(in_buffer, ctypes.POINTER(ctypes.c_byte)))
    out_blob = _DataBlob()

    if not crypt32.CryptUnprotectData(
        ctypes.byref(in_blob),
        None,
        None,
        None,
        None,
        0,
        ctypes.byref(out_blob),
    ):
        raise ctypes.WinError()

    try:
        return ctypes.string_at(out_blob.pbData, out_blob.cbData)
    finally:
        kernel32.LocalFree(out_blob.pbData)

# Return the SQLCipher passphrase and whether it was loaded from disk.
def get_or_create_sqlcipher_passphrase(db_path: Path) -> Tuple[str, bool]:
    env_key = os.getenv("DB_SQLCIPHER_PASSPHRASE", "").strip()
    key_file = _sqlcipher_key_file(db_path)

    if env_key:
        if not key_file.exists():
            key_file.parent.mkdir(parents=True, exist_ok=True)
            key_file.write_bytes(_protect_data(env_key.encode("utf-8")))
        return env_key, True

    if key_file.exists():
        try:
            return _unprotect_data(key_file.read_bytes()).decode("utf-8"), True
        except Exception:
            pass

    generated = secrets.token_urlsafe(48)
    key_file.parent.mkdir(parents=True, exist_ok=True)
    key_file.write_bytes(_protect_data(generated.encode("utf-8")))
    return generated, False


def sqlcipher_available() -> bool:
    return _load_dbapi() is not None


def _key_connection(conn, passphrase: str) -> None:
    cursor = conn.cursor()
    cursor.execute(f"PRAGMA key = {_sql_literal(passphrase)}")
    cursor.execute("PRAGMA cipher_memory_security = ON")
    cursor.execute("SELECT count(*) FROM sqlite_master")
    cursor.close()


def _probe_plaintext(conn) -> bool:
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT count(*) FROM sqlite_master")
        cursor.fetchone()
        return True
    except Exception:
        return False
    finally:
        cursor.close()

# Ensure an on-disk DB file is encrypted with SQLCipher. New databases are keyed on first use. Existing plaintext SQLite files are migrated in place using sqlcipher_export.
def ensure_sqlcipher_database(db_path: Path, passphrase: str) -> None:
    if not sqlcipher_available():
        return

    dbapi = _load_dbapi()
    assert dbapi is not None

    if not db_path.exists() or db_path.stat().st_size == 0:
        return

    # If the file already opens with the key, there is nothing to do.
    try:
        conn = dbapi.connect(str(db_path), timeout=30, check_same_thread=False)
        try:
            _key_connection(conn, passphrase)
            conn.close()
            return
        finally:
            try:
                conn.close()
            except Exception:
                pass
    except Exception:
        pass

    # Try to open as plaintext. If that works, migrate into a SQLCipher file.
    try:
        conn = dbapi.connect(str(db_path), timeout=30, check_same_thread=False)
    except Exception as exc:
        raise RuntimeError(f"Unable to open database at {db_path}: {exc}") from exc

    try:
        if not _probe_plaintext(conn):
            raise RuntimeError(
                f"Database at {db_path} is already encrypted or inaccessible with the current key."
            )

        temp_path = db_path.with_suffix(db_path.suffix + ".sqlcipher.tmp")
        if temp_path.exists():
            temp_path.unlink()

        conn.execute(f"ATTACH DATABASE {_sql_literal(str(temp_path))} AS encrypted KEY {_sql_literal(passphrase)}")
        conn.execute("SELECT sqlcipher_export('encrypted')")
        conn.execute("DETACH DATABASE encrypted")
        conn.close()

        shutil.move(str(temp_path), str(db_path))
    finally:
        try:
            conn.close()
        except Exception:
            pass

# Create a SQLAlchemy engine backed by SQLCipher when available. If SQLCipher is not available, falls back to regular SQLite engine.
def create_sqlcipher_engine(db_path: Path, passphrase: str):
    dbapi = _load_dbapi()

    if dbapi is None:
        return create_engine(f"sqlite:///{db_path.as_posix()}", poolclass=NullPool)

    ensure_sqlcipher_database(db_path, passphrase)

    def _creator():
        conn = dbapi.connect(str(db_path), timeout=30, check_same_thread=False)
        _key_connection(conn, passphrase)
        return conn

    return create_engine("sqlite://", creator=_creator, poolclass=NullPool)
