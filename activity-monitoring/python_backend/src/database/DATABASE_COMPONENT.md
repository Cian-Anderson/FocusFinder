# Database Component

- Handles all data storage for the activity monitoring system
- Source: `activity-monitoring/python_backend/src/database/`
- Main modules: `db_manager.py`, `schema.py`, `sqlcipher_support.py`

---

## Modules

### db_manager.py
- Main interface for all database operations
- Manages connections, sessions, and profile switching (live, baseline, adhd)
- Methods for storing activity events, retrieving summaries, top apps, hourly breakdowns, and more
- Handles SQLCipher encryption if available

### schema.py
- SQLAlchemy ORM models for all tables: `ActivityLog`, `DailyFocusBreakdown`, `ADHDInsights`, `UserSettings`, `ReminderResponse`, `BanditEvent`
- Defines all columns, types, and relationships
- Includes helper to create the database schema

### sqlcipher_support.py
- Handles SQLCipher encryption for secure database storage
- Utilities for key management, encryption, and migration
- Only used if SQLCipher is available on the system

---

## Data Flow

1. All data writes/reads go through `DbManager`
2. ORM models in `schema.py` define the structure and relationships
3. Encryption is handled transparently if enabled
