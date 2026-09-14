# Database Component

This component stores the persistent database artifacts shared by other components.

## Structure

- `data/activity_monitor.db` — main SQLite database file
- `data/activity_monitor.log` — runtime database-related log artifact
- `data/activity_monitor.legacy.log` — migrated legacy log from old layout

## Integration

The activity monitoring backend (`activity-monitoring-component/python_backend`) reads/writes the SQLite file here via:

`final-year-project/database-component/data/activity_monitor.db`

This keeps storage concerns physically separated while leaving the backend ORM code in place for compatibility.

## Encryption Support

The backend now uses SQLCipher when the driver is available.

- SQLCipher encrypts the entire database file, not just selected columns.
- A local passphrase is stored in a Windows-protected key file next to the database unless `DB_SQLCIPHER_PASSPHRASE` is set.
- Existing plaintext database files are migrated automatically on first launch when SQLCipher is available.
