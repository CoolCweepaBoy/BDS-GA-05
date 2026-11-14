# SportsShed API Documentation
## LG-05 — Equipment Issue Management System

This document provides a comprehensive technical reference for all REST API endpoints implemented in the **SportsShed** backend system.

---

## 1. API Architecture & Standards

- **Protocol**: HTTP/1.1
- **Data Format**: `application/json` (UTF-8)
- **Base URL**: `http://localhost:3000`
- **Routing Base**: Express Router modules mounted at `/players`, `/kits`, and `/loans`
- **Architecture Style**: RESTful JSON API with resource-oriented URIs

### Standard HTTP Status Codes

| Status Code | Meaning | Description |
|---|---|---|
| `200 OK` | Success | The request succeeded and returned requested data. |
| `201 Created` | Created | A new resource (Player, Kit, or Loan) was successfully created. |
| `400 Bad Request` | Client Error | Input validation failure, malformed JSON, or invalid ID format. |
| `404 Not Found` | Not Found | Route or requested resource ID does not exist. |
| `409 Conflict` | State Conflict | Duplicate email, kit already issued, loan already returned, or FK constraint block. |
| `500 Internal Server Error` | Server Error | Unhandled server exception (safely masked without leaking stack traces). |

### Standard Error Response Format

```json
{
  "error": "Descriptive message explaining why the request failed."
}
```

---

## 2. Root / System Health Endpoint

### `GET /`
Returns the operational health status and a directory of primary API endpoints.

- **URL**: `/`
- **Method**: `GET`
- **Auth**: None
- **Query Params**: None

**Response `200 OK`**:
```json
{
  "project": "SportsShed - Equipment Issue Management System",
  "status": "running",
  "endpoints": {
    "players": "/players",
    "kits": "/kits",
    "kitsSearch": "/kits?search=Cricket",
    "kitsSummary": "/kits/summary",
    "loans": "/loans",
    "loanDetails": "/loans/details"
  }
}
```

---

## 3. Players Endpoints (`/players`)

### 3.1 Get All Players
- **URL**: `/players`
- **Method**: `GET`
- **Purpose**: Retrieves all registered sports players sorted by `id ASC`.
- **Response `200 OK`**:
```json
[
  {
    "id": 1,
    "name": "Aarav Sharma",
    "email": "aarav.sharma@college.edu",
    "sport": "Cricket"
  },
  {
    "id": 2,
    "name": "Priya Nair",
    "email": "priya.nair@college.edu",
    "sport": "Football"
  }
]
```

### 3.2 Get Player by ID
- **URL**: `/players/:id`
- **Method**: `GET`
- **Route Param**: `id` (positive integer)
- **Response `200 OK`**:
```json
{
  "id": 1,
  "name": "Aarav Sharma",
  "email": "aarav.sharma@college.edu",
  "sport": "Cricket"
}
```
- **Error `400 Bad Request`**: When `:id` is not a positive integer (e.g., `/players/abc` or `/players/-1`).
- **Error `404 Not Found`**: When no player exists with the specified ID.

### 3.3 Register New Player
- **URL**: `/players`
- **Method**: `POST`
- **Headers**: `Content-Type: application/json`
- **Request Body**:
```json
{
  "name": "Karan Mehta",
  "email": "karan.mehta@college.edu",
  "sport": "Cricket"
}
```
- **Validation Rules**:
  - `name`: Non-empty string (trimmed).
  - `email`: Valid RFC 5322 email format; normalized to lowercase; must be unique.
  - `sport`: Non-empty string (trimmed).
- **Response `201 Created`**:
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
- **Error `409 Conflict`**: If the email is already registered (`A player with this email already exists.`).

### 3.4 Update Player Details
- **URL**: `/players/:id`
- **Method**: `PUT`
- **Request Body** (at least one field required):
```json
{
  "name": "Karan K. Mehta",
  "sport": "Football"
}
```
- **Response `200 OK`**:
```json
{
  "message": "Player updated successfully.",
  "player": {
    "id": 5,
    "name": "Karan K. Mehta",
    "email": "karan.mehta@college.edu",
    "sport": "Football"
  }
}
```

### 3.5 Delete Player
- **URL**: `/players/:id`
- **Method**: `DELETE`
- **Integrity Check**:
  - Cannot delete if player has an active unreturned loan (`409 Conflict`).
  - Cannot delete if player is referenced by historical loan records due to SQLite foreign key `ON DELETE RESTRICT` (`409 Conflict`).
- **Response `200 OK`**:
```json
{
  "message": "Player deleted successfully.",
  "deletedPlayer": {
    "id": 5,
    "name": "Karan K. Mehta",
    "email": "karan.mehta@college.edu",
    "sport": "Football"
  }
}
```

---

## 4. Kits Endpoints (`/kits`)

### 4.1 Get All Kits / Search Kits by Sport
- **URL**: `/kits`
- **Method**: `GET`
- **Optional Query Parameter**: `?search={sport}`
  - Example: `GET /kits?search=Cricket`
  - Searches `sport` case-insensitively using SQL `LOWER(sport) LIKE LOWER(?) ESCAPE '\'`.
  - Wildcard characters (`%`, `_`, `\`) are safely escaped.
- **Response `200 OK`** (with search):
```json
[
  {
    "id": 1,
    "name": "Willow Cricket Bat",
    "sport": "Cricket",
    "status": "Issued"
  },
  {
    "id": 2,
    "name": "Leather Match Ball",
    "sport": "Cricket",
    "status": "Available"
  }
]
```

### 4.2 Kits Inventory Summary Report
- **URL**: `/kits/summary`
- **Method**: `GET`
- **Routing Precedence**: Defined before `/kits/:id` to prevent route collision.
- **SQL Implementation**:
  ```sql
  SELECT sport, COUNT(*) AS count
  FROM kits
  GROUP BY sport
  ORDER BY sport ASC
  ```
- **Response `200 OK`**:
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
*(Returns an empty array `[]` when no kits exist in the database.)*

### 4.3 Get Kit by ID
- **URL**: `/kits/:id`
- **Method**: `GET`
- **Response `200 OK`**:
```json
{
  "id": 2,
  "name": "Leather Match Ball",
  "sport": "Cricket",
  "status": "Available"
}
```

### 4.4 Add New Kit
- **URL**: `/kits`
- **Method**: `POST`
- **Request Body**:
```json
{
  "name": "Practice Cricket Helmet",
  "sport": "Cricket",
  "status": "Available"
}
```
*(Note: `status` is optional and defaults to `"Available"`. Valid values are `"Available"` or `"Issued"`.)*
- **Response `201 Created`**:
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

### 4.5 Update Kit Details
- **URL**: `/kits/:id`
- **Method**: `PUT`
- **Request Body**:
```json
{
  "name": "Tournament Cricket Helmet",
  "status": "Available"
}
```
- **Response `200 OK`**:
```json
{
  "message": "Kit updated successfully.",
  "kit": {
    "id": 10,
    "name": "Tournament Cricket Helmet",
    "sport": "Cricket",
    "status": "Available"
  }
}
```

### 4.6 Delete Kit
- **URL**: `/kits/:id`
- **Method**: `DELETE`
- **Integrity Check**:
  - Cannot delete if `status === 'Issued'` or has an active loan (`409 Conflict`).
  - Cannot delete if referenced by historical loan records due to `ON DELETE RESTRICT` (`409 Conflict`).
- **Response `200 OK`**:
```json
{
  "message": "Kit deleted successfully.",
  "deletedKit": {
    "id": 10,
    "name": "Tournament Cricket Helmet",
    "sport": "Cricket",
    "status": "Available"
  }
}
```

---

## 5. Loans Endpoints (`/loans`)

### 5.1 Get All Loans
- **URL**: `/loans`
- **Method**: `GET`
- **Purpose**: Returns raw loan records.
- **Response `200 OK`**:
```json
[
  {
    "id": 1,
    "player_id": 1,
    "kit_id": 1,
    "loan_date": "2026-11-10",
    "return_date": null
  },
  {
    "id": 2,
    "player_id": 2,
    "kit_id": 5,
    "loan_date": "2026-11-05",
    "return_date": "2026-11-08"
  }
]
```

### 5.2 Get Loan Details Using 3-Table SQL JOIN
- **URL**: `/loans/details`
- **Method**: `GET`
- **Routing Precedence**: Defined before `/loans/:id`.
- **SQL Implementation**:
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
  ORDER BY loans.id ASC
  ```
- **Response `200 OK`**:
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

### 5.3 Issue Equipment Kit (Create Loan)
- **URL**: `/loans`
- **Method**: `POST`
- **Request Body**:
```json
{
  "player_id": 3,
  "kit_id": 2,
  "loan_date": "2026-11-12"
}
```
*(Note: `loan_date` defaults to today's date `YYYY-MM-DD` if omitted).*
- **Transactional Steps**:
  1. Validates player exists in `players` table (`404` if missing).
  2. Validates kit exists in `kits` table (`404` if missing).
  3. Checks `kits.status === 'Available'` and no active unreturned loan exists (`409 Conflict` if already issued).
  4. Inserts new loan record with `return_date = NULL`.
  5. Updates kit status to `'Issued'`.
- **Response `201 Created`**:
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

### 5.4 Return Equipment Kit (Update Loan)
- **URL**: `/loans/:id`
- **Method**: `PUT`
- **Request Body**:
```json
{
  "return_date": "2026-11-14"
}
```
*(Alternatively: `{"returned": true}` automatically records today's date).*
- **Transactional Steps**:
  1. Finds existing loan record (`404` if missing).
  2. Ensures loan is not already returned (`409 Conflict` if `return_date !== null`).
  3. Updates `return_date` in `loans` table.
  4. Sets referenced kit's status back to `'Available'`.
- **Response `200 OK`**:
```json
{
  "message": "Kit returned successfully.",
  "loan": {
    "id": 3,
    "player_id": 3,
    "kit_id": 2,
    "loan_date": "2026-11-12",
    "return_date": "2026-11-14"
  }
}
```

### 5.5 Delete Loan Record
- **URL**: `/loans/:id`
- **Method**: `DELETE`
- **Behavior**: If the deleted loan was active (`return_date === null`), the system automatically restores the kit's status to `'Available'` inside an atomic transaction.
- **Response `200 OK`**:
```json
{
  "message": "Loan deleted successfully.",
  "deletedLoan": {
    "id": 3,
    "player_id": 3,
    "kit_id": 2,
    "loan_date": "2026-11-12",
    "return_date": "2026-11-14"
  }
}
```
