# SportsShed Project Architecture & Engineering Documentation
## LG-05 — Equipment Issue Management System

This document outlines the system architecture, design decisions, database model, module responsibilities, and implementation details for the **SportsShed** backend assignment.

---

## 1. System Overview

**SportsShed** is an automated Equipment Issue Management backend developed to solve the inventory tracking challenges faced by institutional sports departments. In traditional physical sheds, sports equipment is loaned out informally, leading to misplaced kits, lack of accountability, unknown stock availability, and inability to produce sport-wise inventory summaries.

The system is built as a lightweight, robust REST API server utilizing **Node.js**, **Express.js**, and an embedded relational **SQLite** database via `better-sqlite3`.

---

## 2. Architectural Design & Data Flow

The application follows an idiomatic, modular layered architecture adhering to the **Separation of Concerns (SoC)** principle:

```
[ HTTP Client / Postman / Tests ]
               │
               ▼
   [ Express Application Server ] (server.js)
               │
       ┌───────┴───────┐
       ▼               ▼
[ express.json() ] [ Custom Error & 404 Handlers ]
               │
               ▼
     [ Modular Routers ] (routes/)
   ├── players.js
   ├── kits.js
   └── loans.js
               │
               ▼
  [ Controllers / Business Logic ] (controllers/)
   ├── playersController.js
   ├── kitsController.js
   └── loansController.js
               │
       ┌───────┴───────┐
       ▼               ▼
[ Input Validators ] [ better-sqlite3 Connection ]
 (validators.js)      (database/database.js)
                       │
                       ▼
            [ SQLite Engine & WAL ]
             (database/schema.sql)
```

### Flow Breakdown
1. **Request Lifecycle**: An incoming HTTP request hits `server.js`, where JSON parsing is applied.
2. **Routing & Dispatch**: The route matches one of the modular routers in `routes/`.
3. **Validation & Business Logic**: The controller delegates input checking to `middleware/validators.js`.
4. **Database Execution**: Parameterized SQL queries or transactions execute synchronously via `better-sqlite3`.
5. **Response or Error Dispatch**: Success returns formatted JSON with semantic status codes (`200`, `201`). Any raised operational error (`AppError`) or database constraint triggers the centralized `errorHandler.js`.

---

## 3. Relational Database Design

The relational database is defined in `database/schema.sql` and initialized automatically on startup by `database/database.js`.

### 3.1 SQLite Enforcement & Foreign Keys
By default, SQLite does not enforce foreign keys. SportsShed enforces relational integrity at runtime:
```sql
PRAGMA foreign_keys = ON;
```
This pragma is executed automatically on every database initialization.

### 3.2 Schema Definition

```sql
PRAGMA foreign_keys = ON;

-- Table 1: Players
CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    sport TEXT NOT NULL
);

-- Table 2: Kits
CREATE TABLE IF NOT EXISTS kits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    sport TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Available' CHECK (status IN ('Available', 'Issued'))
);

-- Table 3: Loans
CREATE TABLE IF NOT EXISTS loans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER NOT NULL,
    kit_id INTEGER NOT NULL,
    loan_date TEXT NOT NULL DEFAULT (DATE('now')),
    return_date TEXT DEFAULT NULL,
    FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    FOREIGN KEY (kit_id) REFERENCES kits(id) ON DELETE RESTRICT ON UPDATE CASCADE
);
```

### 3.3 Data Integrity & Foreign Key Safeguards
- **Entity Identity**: All tables use auto-incrementing integer primary keys.
- **Unique Email Constraint**: Player email addresses have a `UNIQUE` constraint and are validated against RFC 5322 regex.
- **Status Domain Validation**: Kit status is restricted by a `CHECK` constraint: `CHECK (status IN ('Available', 'Issued'))`.
- **Referential Integrity (`ON DELETE RESTRICT`)**: Prevents orphaned loans. If a kit or player is referenced in historical loan records, SQLite denies the deletion with a foreign key violation, safeguarding audit history.
- **Double-Issue Prevention**: When issuing equipment, the system checks that the kit status is `'Available'` and verifies no active unreturned record (`return_date IS NULL`) exists before proceeding.

---

## 4. Atomic Transactions for State Management

Equipments issue and return operations require synchronizing two separate entities: the `loans` record and the `kits.status` column. To prevent desynchronization (such as creating a loan without marking the kit as issued), operations run inside `db.transaction()`:

```javascript
const issueTransaction = db.transaction(() => {
    // 1. Verify player exists
    // 2. Verify kit exists
    // 3. Ensure kit is Available
    // 4. Insert loan record
    // 5. Update kits SET status = 'Issued'
    return createdLoan;
});
```

If any validation fails or a query throws an error, SQLite automatically rolls back all intermediate operations.

---

## 5. SQL Query Engineering

### 5.1 Three-Table SQL INNER JOIN
To present clear, actionable data to sports coordinators, `GET /loans/details` combines three relational tables:
```sql
SELECT
    loans.id AS loan_id,
    players.id AS player_id,
    players.name AS player_name,
    kits.id AS kit_id,
    kits.name AS kit_name,
    kits.sport AS sport,
    loans.loan_date,
    loans.return_date
FROM loans
INNER JOIN players ON loans.player_id = players.id
INNER JOIN kits ON loans.kit_id = kits.id
ORDER BY loans.id ASC;
```

### 5.2 SQL COUNT() and GROUP BY Summary
`GET /kits/summary` aggregates equipment quantities directly inside SQLite rather than loading rows into memory:
```sql
SELECT sport, COUNT(*) AS count
FROM kits
GROUP BY sport
ORDER BY sport ASC;
```
This guarantees accurate aggregation without memory overhead or pagination truncation.

### 5.3 Safe Parameterized Sport Search
In `GET /kits?search=...`, user queries are escaped and passed via parameter bindings to prevent SQL injection:
```sql
SELECT id, name, sport, status
FROM kits
WHERE LOWER(sport) LIKE LOWER(?) ESCAPE '\'
ORDER BY id ASC;
```

---

## 6. Directory Structure & File Map

```
sports-shed/
│
├── controllers/                     # Harsha (REST API & CRUD Developer)
│   ├── kitsController.js            # Kits CRUD, SQL summary, and sport search logic
│   ├── loansController.js           # Loan issue/return transactions and 3-table JOIN
│   └── playersController.js         # Player management and validation checks
│
├── database/                        # Gopal (Database Designer & SQL Developer)
│   ├── database.js                  # Database connection, PRAGMA foreign_keys, auto-seeding
│   ├── schema.sql                   # 3-table DDL schema definition
│   └── sportsshed.db                # SQLite database binary (git-ignored)
│
├── middleware/                      # Rizwana (Validation & Search Developer)
│   ├── errorHandler.js              # Centralized error handler and AppError class
│   └── validators.js                # Input validators (IDs, strings, email, date)
│
├── routes/                          # Ashraf (Backend Server & Routing Developer)
│   ├── kits.js                      # /kits router with /summary precedence
│   ├── loans.js                     # /loans router with /details precedence
│   └── players.js                   # /players router
│
├── tests/                           # Ehtesham (Software Tester & Quality Analyst)
│   └── summary.test.js              # Integration tests (10 test cases, 0 failures)
│
├── docs/                            # Kaushik (Documentation & API Testing Engineer)
│   ├── API_DOCUMENTATION.md         # Full REST API specification
│   ├── PROJECT_DOCUMENTATION.md     # Architecture and engineering documentation
│   └── TESTING_DOCUMENTATION.md     # Testing strategy and test run report
│
├── screenshots/                     # Kaushik (Testing Evidence)
│   ├── kits-api.png
│   ├── kits-search.png
│   ├── kits-summary.png
│   ├── loan-details.png
│   ├── loans-api.png
│   ├── players-api.png
│   ├── postman-testing.png
│   ├── project-structure.png
│   ├── root-api.png
│   └── server-running.png
│
├── .gitignore                       # Repository exclusion rules
├── package.json                     # Node.js project manifest
├── package-lock.json                # Lockfile
├── README.md                        # Master project documentation
├── server.js                        # Ashraf: Application entry point and server setup
└── SportsShed.postman_collection.json # Kaushik: 14-request Postman test suite
```

---

## 7. Security & Error Masking

1. **SQL Injection Defense**: No raw string concatenation is used in SQL statements. All runtime variables use SQLite positional parameter binding (`?`).
2. **Centralized Error Masking**: `middleware/errorHandler.js` intercepts operational errors (`AppError`) and maps database constraints (`SQLITE_CONSTRAINT_UNIQUE`, `SQLITE_CONSTRAINT_FOREIGNKEY`) to client-safe HTTP messages. Raw database internals and stack traces are suppressed in production.
3. **Route Precedence Protection**: Static sub-routes (`/kits/summary` and `/loans/details`) are mounted before dynamic parameterized routes (`/kits/:id` and `/loans/:id`), preventing routing collisions in Express.
