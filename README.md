# SportsShed — Equipment Issue Management System

A beginner-friendly REST API backend built with **Node.js**, **Express.js**, and **SQLite** to manage sports equipment, players, loans, availability tracking, sport-based kit searching, and inventory summary reports.

---

## 1. Problem Statement

A college sports department stores kits such as cricket bats, balls, and footballs inside a locked shed. Equipment is frequently issued to players, but without a proper tracking system, kits go missing and the coach cannot tell who borrowed a specific item or how many kits exist for each sport.

**SportsShed** solves this problem by providing a structured backend API that tracks:
- **Players** registered in the sports department
- **Sports Kits** and their live status (`Available` or `Issued`)
- **Equipment Loans** linking players and kits with issue and return dates
- **3-Table SQL JOIN Details** so coaches immediately see player names and kit names together
- **Sport Search** (`GET /kits?search=Cricket`) using safe parameterized SQL queries
- **Summary by Sport** (`GET /kits/summary`) using SQL `COUNT()` and `GROUP BY`

---

## 2. Technologies Used

- **Node.js** (JavaScript runtime, CommonJS modules)
- **Express.js** (REST API server and routing)
- **SQLite** via `better-sqlite3` (Lightweight file-based relational database with foreign keys and atomic transactions)
- **Node Built-in Test Runner (`node:test`)** (Automated integration tests)
- **Postman** (API testing and demonstration collection)

---

## 3. Project Structure

```text
sports-shed/
├── database/
│   ├── database.js                    # Automatic DB setup, FK enforcement, sample seeding
│   └── schema.sql                     # SQLite schema with 3 related tables
├── routes/
│   ├── players.js                     # /players routes
│   ├── kits.js                        # /kits routes (/summary placed before /:id)
│   └── loans.js                       # /loans routes (/details placed before /:id)
├── controllers/
│   ├── playersController.js           # Players CRUD + validation
│   ├── kitsController.js              # Kits CRUD, search, and SQL GROUP BY summary
│   └── loansController.js             # Issue/return transactions and 3-table JOIN query
├── middleware/
│   ├── errorHandler.js                # AppError class, 404 handler, safe JSON error handler
│   └── validators.js                  # Reusable input validators (IDs, strings, email, dates, status)
├── tests/
│   └── summary.test.js                # 3 required summary tests + full API tests
├── server.js                          # Express app setup and server startup
├── package.json
├── .gitignore
├── README.md
└── SportsShed.postman_collection.json
```

---

## 4. Database Structure

The SQLite database (`database/sportsshed.db`) is automatically created when the server starts (`PRAGMA foreign_keys = ON` enabled on every connection) and contains **exactly three related tables**:

### 1. `players`
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` | Unique player ID |
| `name` | `TEXT` | `NOT NULL` | Player's full name |
| `email` | `TEXT` | `NOT NULL UNIQUE` | Validated lowercase email address |
| `sport` | `TEXT` | `NOT NULL` | Player's primary sport |

### 2. `kits`
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` | Unique kit ID |
| `name` | `TEXT` | `NOT NULL` | Equipment name |
| `sport` | `TEXT` | `NOT NULL` | Sport category |
| `status` | `TEXT` | `NOT NULL DEFAULT 'Available' CHECK (status IN ('Available', 'Issued'))` | Current availability status |

### 3. `loans`
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` | Unique loan ID |
| `player_id` | `INTEGER` | `NOT NULL`, `FOREIGN KEY -> players(id) ON DELETE RESTRICT` | Borrowing player ID |
| `kit_id` | `INTEGER` | `NOT NULL`, `FOREIGN KEY -> kits(id) ON DELETE RESTRICT` | Borrowed kit ID |
| `loan_date` | `TEXT` | `NOT NULL DEFAULT (DATE('now'))` | Issue date (`YYYY-MM-DD`) |
| `return_date` | `TEXT` | `DEFAULT NULL` | Return date (`NULL` while active) |

### Relationships
- One **Player** can have many **Loans** (`1 : N`).
- One **Kit** can appear in many historical **Loans** over time (`1 : N`), but only **one active loan** (`return_date IS NULL`) at any time.
- `ON DELETE RESTRICT` prevents deleting a player or kit that still has loan records, preserving audit integrity.

> **Sample Data:** On first startup with a fresh database file, the server automatically seeds 4 players, 9 kits (4 Cricket, 3 Football, 2 Basketball), and 2 sample loans (1 active, 1 returned) so you can immediately explore all endpoints. You can skip seeding by setting `SKIP_SEED=true`.

---

## 5. Installation & Running the Project

### Prerequisites
- **Node.js** (v18 or newer; tested on Node v24.14.0)
- **npm**

### Installation
```bash
cd sports-shed
npm install
```

### Start the Server
```bash
npm start
```
The server automatically initializes `database/sportsshed.db` and starts listening at:
`http://localhost:3000`

*(Optional: customize port with `PORT=4000 npm start`.)*

---

## 6. API Endpoint Documentation

### HTTP Status Codes Used
- `200 OK` – Request succeeded
- `201 Created` – New resource created (player, kit, or loan)
- `400 Bad Request` – Invalid input, missing field, malformed JSON, or invalid ID
- `404 Not Found` – Resource or route not found
- `409 Conflict` – Duplicate email, already-issued kit, already-returned loan, or FK delete conflict
- `500 Internal Server Error` – Unexpected server error (no database stack traces exposed)

---

### Players API (`/players`)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/players` | Get all players |
| `GET` | `/players/:id` | Get one player by ID |
| `POST` | `/players` | Register a new player |
| `PUT` | `/players/:id` | Update a player's details |
| `DELETE` | `/players/:id` | Delete a player (blocked with `409` if referenced by loans) |

**Example: `POST /players`**
```json
{
  "name": "Karan Mehta",
  "email": "karan.mehta@college.edu",
  "sport": "Cricket"
}
```
**Response (`201 Created`):**
```json
{
  "message": "Player created successfully.",
  "player": {
    "id": 5,
    "name": "Karan Mehta",
    "email": "karan.mehta@college.edu",
    "sport": "Cricket"
  }
}
```

---

### Kits API (`/kits`)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/kits` | Get all kits |
| `GET` | `/kits?search=Cricket` | Case-insensitive sport search (`search=Football` also supported) |
| `GET` | `/kits/summary` | Count of kits per sport using SQL `COUNT()` and `GROUP BY` |
| `GET` | `/kits/:id` | Get one kit by ID |
| `POST` | `/kits` | Add a new kit (defaults `status` to `"Available"`) |
| `PUT` | `/kits/:id` | Update kit `name`, `sport`, and/or `status` (`"Available"` or `"Issued"`) |
| `DELETE` | `/kits/:id` | Delete a kit (blocked with `409` if issued or referenced by loans) |

**Example: `POST /kits`**
```json
{
  "name": "Practice Cricket Helmet",
  "sport": "Cricket"
}
```
**Response (`201 Created`):**
```json
{
  "message": "Kit added successfully.",
  "kit": {
    "id": 10,
    "name": "Practice Cricket Helmet",
    "sport": "Cricket",
    "status": "Available"
  }
}
```

**Example: `GET /kits?search=Football`**
```json
[
  {
    "id": 5,
    "name": "Match Football Size 5",
    "sport": "Football",
    "status": "Available"
  },
  {
    "id": 6,
    "name": "Goalkeeper Gloves",
    "sport": "Football",
    "status": "Available"
  },
  {
    "id": 7,
    "name": "Football Training Cones",
    "sport": "Football",
    "status": "Available"
  }
]
```

**Example: `GET /kits/summary`**
```json
[
  {
    "sport": "Basketball",
    "count": 2
  },
  {
    "sport": "Cricket",
    "count": 4
  },
  {
    "sport": "Football",
    "count": 3
  }
]
```
*(Returns `[]` when there are no kits in the database.)*

---

### Loans API (`/loans`)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/loans` | Get all loans |
| `GET` | `/loans/details` | Get all loans with player & kit names via 3-table SQL `INNER JOIN` |
| `GET` | `/loans/:id` | Get one loan by ID |
| `POST` | `/loans` | Issue an `Available` kit to a player (transactional) |
| `PUT` | `/loans/:id` | Update a loan or record a kit return (`return_date`) |
| `DELETE` | `/loans/:id` | Delete a loan (restores kit to `Available` if loan was active) |

**Example: Issue Kit — `POST /loans`**
```json
{
  "player_id": 3,
  "kit_id": 2,
  "loan_date": "2026-11-12"
}
```
*(Note: `loan_date` is optional and defaults to today's date in `YYYY-MM-DD` format.)*

**Response (`201 Created`):**
```json
{
  "message": "Kit issued successfully.",
  "loan": {
    "id": 3,
    "player_id": 3,
    "kit_id": 2,
    "loan_date": "2026-11-12",
    "return_date": null
  }
}
```

**Example: Return Kit — `PUT /loans/3`**
```json
{
  "return_date": "2026-11-12"
}
```
**Response (`200 OK`):**
```json
{
  "message": "Kit returned successfully.",
  "loan": {
    "id": 3,
    "player_id": 3,
    "kit_id": 2,
    "loan_date": "2026-11-12",
    "return_date": "2026-11-12"
  }
}
```

**Example: 3-Table SQL JOIN — `GET /loans/details`**
```json
[
  {
    "loan_id": 1,
    "player_id": 1,
    "player_name": "Aarav Sharma",
    "kit_id": 1,
    "kit_name": "Willow Cricket Bat",
    "sport": "Cricket",
    "loan_date": "2026-11-10",
    "return_date": null
  },
  {
    "loan_id": 2,
    "player_id": 2,
    "player_name": "Priya Nair",
    "kit_id": 5,
    "kit_name": "Match Football Size 5",
    "sport": "Football",
    "loan_date": "2026-11-05",
    "return_date": "2026-11-08"
  }
]
```

---

## 7. Running Automated Tests (Including the 3 Summary Tests)

All automated tests run against a completely **separate temporary test database** (`tests/test-sportsshed.db`) that is cleaned up after tests complete—your main `database/sportsshed.db` is never modified or deleted.

Run the full test suite:
```bash
npm test
```

### What `tests/summary.test.js` Verifies
1. **Summary Test 1 (Two Sport Categories):** Inserts 4 Cricket kits and 3 Football kits, calls `GET /kits/summary`, and asserts exact output:
   `[{"sport":"Cricket","count":4},{"sport":"Football","count":3}]`.
2. **Summary Test 2 (More Than 200 Kits):** Inserts 225 kits across 5 sports (`Badminton: 30`, `Basketball: 45`, `Cricket: 60`, `Football: 55`, `Tennis: 35`) and verifies `GET /kits/summary` returns exact SQL aggregation counts for all 225 kits with no pagination limit or dropped records.
3. **Summary Test 3 (Empty Database):** Clears all kit records and verifies `GET /kits/summary` returns `[]` (`200 OK`).
4. **Full API Coverage:** Tests kit/player CRUD, case-insensitive sport search & SQL injection resistance, transactional loan issue/return status updates, 3-table SQL `JOIN` (`/loans/details`), foreign key enforcement, validation errors (`400`), missing resources (`404`), and conflict states (`409`).

---

## 8. Importing and Using the Postman Collection

1. Start the server with `npm start`.
2. Open **Postman**.
3. Click **Import** (top left) and select `SportsShed.postman_collection.json`.
4. Confirm the collection variable `baseUrl` is set to `http://localhost:3000`.
5. Run requests **01 through 14** in order (the collection automatically saves created IDs into `playerId`, `kitId`, and `loanId` variables when running sequentially on a fresh seeded database).
