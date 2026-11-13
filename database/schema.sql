-- SportsShed SQLite Database Schema
-- Enables foreign key enforcement so invalid player_id or kit_id references are rejected
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
