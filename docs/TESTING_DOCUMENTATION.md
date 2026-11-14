# SportsShed Testing & Quality Assurance Documentation
## LG-05 — Equipment Issue Management System

This document outlines the testing strategy, test suite architecture, automated test results, and Postman API verification for the **SportsShed** backend system.

---

## 1. Testing Strategy & Isolation

The quality assurance strategy combines automated integration tests with end-to-end API collection validation.

### Test Database Isolation
To ensure test runs never corrupt or delete user data in the main application database (`database/sportsshed.db`), the test suite initializes a completely isolated SQLite database:
- **Test Database Path**: `tests/test-sportsshed.db`
- **Setup Hook (`before`)**: Creates the ephemeral test database and starts an Express test server on an ephemeral port.
- **Teardown Hook (`after`)**: Shuts down the HTTP server, closes the SQLite database connection, and deletes `tests/test-sportsshed.db`.
- **Reset Hook (`beforeEach`)**: Truncates tables (`DELETE FROM loans; DELETE FROM kits; DELETE FROM players;`) between individual test cases, ensuring test independence.

---

## 2. Automated Test Suite (`tests/summary.test.js`)

The test suite is written using Node.js's native test runner (`node:test`) and strict assertions (`node:assert/strict`).

### Summary of Test Suites & Covered Scenarios

| Test Suite | Test Case | Target Feature / Method | Expected Result | Status |
|---|---|---|---|---|
| **Database Constraints & Schema** | Foreign keys & user tables | SQLite `PRAGMA foreign_keys` & schema check | FK enabled (`1`), exactly 3 tables: `kits`, `loans`, `players` | **PASS** |
| **Required Tests for `GET /kits/summary`** | **TEST 1: Two Sport Categories** | `GET /kits/summary` | Adding 4 Cricket and 3 Football kits returns `[{"sport":"Cricket","count":4},{"sport":"Football","count":3}]` | **PASS** |
| | **TEST 2: More Than 200 Kits** | `GET /kits/summary` (Scale test) | 225 kits across 5 sports aggregate accurately with zero record loss or truncation | **PASS** |
| | **TEST 3: Empty Database** | `GET /kits/summary` | Empty kits table returns empty array `[]` (`200 OK`) | **PASS** |
| **Kits CRUD & Sport Search** | Kits CRUD operations | `POST`, `GET`, `PUT`, `DELETE /kits` | Full kit lifecycle succeeds; deleted kit returns 404 | **PASS** |
| | Case-insensitive search & SQL injection defense | `GET /kits?search=...` | Case-insensitive matching works; SQL injection `' OR '1'='1` is safely escaped | **PASS** |
| **Players, Loans & JOIN** | Complete loan lifecycle & JOIN details | `POST /players`, `POST /kits`, `POST /loans`, `PUT /loans/:id`, `GET /loans/details` | Kit status transitions (`Available` -> `Issued` -> `Available`), 3-table JOIN returns joined names, double-issue returns 409 | **PASS** |
| **Validation & Error Handling** | Rejection of invalid inputs | Input validators (`middleware/validators.js`) | Empty strings, invalid statuses, malformed emails, and invalid JSON return `400 Bad Request` | **PASS** |
| | Invalid & non-existent IDs | Route param validation | Non-integer IDs return `400`; missing IDs return `404 Not Found` | **PASS** |
| | Foreign keys & active loan deletion | Constraint enforcement | SQLite FK constraint blocks orphan rows; deleting active loan restores kit to `Available` | **PASS** |

---

## 3. Automated Test Execution Output

Executing `npm test` produces the following clean test report:

```text
> sports-shed@1.0.0 test
> node --test tests/*.test.js

▶ SportsShed Backend API & Summary Tests
  ▶ Database Constraints & Schema
    ✔ should have exactly 3 user tables and foreign keys enabled (4.7078ms)
  ✔ Database Constraints & Schema (5.1525ms)
  ▶ Required Tests for GET /kits/summary
    ✔ TEST 1: returns accurate counts when adding kits in two sport categories (4 Cricket, 3 Football) (195.0957ms)
    ✔ TEST 2: accurately aggregates more than 200 kits across multiple sports with no truncation (12.1817ms)
    ✔ TEST 3: returns empty array [] when database has no kit records (9.2326ms)
  ✔ Required Tests for GET /kits/summary (216.8971ms)
  ▶ Kits CRUD & Sport Search API
    ✔ supports adding, reading, updating, and deleting kits (21.6555ms)
    ✔ supports case-insensitive sport search and SQL injection resistance via ?search= (23.0585ms)
  ✔ Kits CRUD & Sport Search API (45.0194ms)
  ▶ Players, Loans, Issue/Return Logic & JOIN Endpoint
    ✔ handles complete player CRUD and loan issue/return lifecycle with JOIN details (61.6961ms)
  ✔ Players, Loans, Issue/Return Logic & JOIN Endpoint (61.9081ms)
  ▶ Validation & Error Handling
    ✔ rejects invalid inputs with 400 Bad Request (16.8559ms)
    ✔ rejects invalid IDs with 400 and non-existent IDs with 404 (28.0116ms)
    ✔ enforces foreign keys in SQLite, prevents duplicate emails, and restores kit status when deleting active loan (42.7308ms)
  ✔ Validation & Error Handling (87.8618ms)
✔ SportsShed Backend API & Summary Tests (473.9424ms)
ℹ tests 10
ℹ suites 6
ℹ pass 10
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 4170.9337
```

**Overall Pass Rate: 10 / 10 (100%)**

---

## 4. Postman Collection Testing (`SportsShed.postman_collection.json`)

A dedicated 14-step Postman collection tests the API from end to end.

### Execution Sequence & Dynamic Variables

| Step | Request Name | Method | Endpoint | Expected Code | Dynamic Variable Saved |
|---|---|---|---|---|---|
| 01 | Get all players | `GET` | `/players` | `200 OK` | — |
| 02 | Add player | `POST` | `/players` | `201 Created` | `pm.collectionVariables.set('playerId', ...)` |
| 03 | Update player | `PUT` | `/players/{{playerId}}` | `200 OK` | — |
| 04 | Delete player | `DELETE` | `/players/{{playerId}}` | `200 OK` | — |
| 05 | Get all kits | `GET` | `/kits` | `200 OK` | — |
| 06 | Add kit | `POST` | `/kits` | `201 Created` | `pm.collectionVariables.set('kitId', ...)` |
| 07 | Update kit | `PUT` | `/kits/{{kitId}}` | `200 OK` | — |
| 08 | Delete kit | `DELETE` | `/kits/{{kitId}}` | `200 OK` | — |
| 09 | Search kits by sport | `GET` | `/kits?search=Cricket` | `200 OK` | — |
| 10 | Get all loans | `GET` | `/loans` | `200 OK` | — |
| 11 | Issue kit | `POST` | `/loans` | `201 Created` | `pm.collectionVariables.set('loanId', ...)` |
| 12 | Return kit | `PUT` | `/loans/{{loanId}}` | `200 OK` | — |
| 13 | Get loan details using JOIN | `GET` | `/loans/details` | `200 OK` | — |
| 14 | Get summary by sport | `GET` | `/kits/summary` | `200 OK` | — |

### Postman Test Run Summary
- **Total Requests**: 14
- **Passed**: 14
- **Failed**: 0
- **Success Rate**: 100%
- **Evidence Screenshot**: `screenshots/postman-testing.png`
