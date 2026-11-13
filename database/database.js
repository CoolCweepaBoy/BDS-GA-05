const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DEFAULT_DB_PATH = path.join(__dirname, 'sportsshed.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

let dbInstance = null;

/**
 * Inserts realistic initial sample data when the database has no records yet.
 * Runs inside a transaction so all initial rows are inserted atomically.
 */
function seedSampleData(db) {
    const playerCount = db.prepare('SELECT COUNT(*) AS count FROM players').get().count;
    const kitCount = db.prepare('SELECT COUNT(*) AS count FROM kits').get().count;
    const loanCount = db.prepare('SELECT COUNT(*) AS count FROM loans').get().count;

    // Only seed when all three tables are completely empty
    if (playerCount > 0 || kitCount > 0 || loanCount > 0) {
        return false;
    }

    const insertPlayer = db.prepare(
        'INSERT INTO players (name, email, sport) VALUES (?, ?, ?)'
    );
    const insertKit = db.prepare(
        'INSERT INTO kits (name, sport, status) VALUES (?, ?, ?)'
    );
    const insertLoan = db.prepare(
        'INSERT INTO loans (player_id, kit_id, loan_date, return_date) VALUES (?, ?, ?, ?)'
    );

    const seedTransaction = db.transaction(() => {
        const p1 = insertPlayer.run('Aarav Sharma', 'aarav.sharma@college.edu', 'Cricket');
        const p2 = insertPlayer.run('Priya Nair', 'priya.nair@college.edu', 'Football');
        insertPlayer.run('Rohan Verma', 'rohan.verma@college.edu', 'Basketball');
        insertPlayer.run('Ananya Iyer', 'ananya.iyer@college.edu', 'Cricket');

        const k1 = insertKit.run('Willow Cricket Bat', 'Cricket', 'Issued');
        insertKit.run('Leather Match Ball', 'Cricket', 'Available');
        insertKit.run('Batting Pads Set', 'Cricket', 'Available');
        insertKit.run('Wicket Keeping Gloves', 'Cricket', 'Available');

        const k5 = insertKit.run('Match Football Size 5', 'Football', 'Available');
        insertKit.run('Goalkeeper Gloves', 'Football', 'Available');
        insertKit.run('Football Training Cones', 'Football', 'Available');

        insertKit.run('Indoor Basketball', 'Basketball', 'Available');
        insertKit.run('Basketball Air Pump', 'Basketball', 'Available');

        // Sample active loan (kit 1 is currently Issued to player 1)
        insertLoan.run(p1.lastInsertRowid, k1.lastInsertRowid, '2026-11-10', null);

        // Sample completed (returned) loan (kit 5 was returned by player 2)
        insertLoan.run(p2.lastInsertRowid, k5.lastInsertRowid, '2026-11-05', '2026-11-08');
    });

    seedTransaction();
    return true;
}

/**
 * Initializes the SQLite connection, enables foreign keys, creates tables from schema.sql,
 * and optionally seeds sample data on an empty main database.
 *
 * @param {string} [dbPath] - File path for SQLite DB or ':memory:'.
 * @param {object} [options]
 * @param {boolean} [options.seed=true] - Whether to populate initial sample data if DB is empty.
 * @returns {import('better-sqlite3').Database}
 */
function initDatabase(dbPath = process.env.DB_PATH || DEFAULT_DB_PATH, options = {}) {
    if (dbInstance) {
        dbInstance.close();
        dbInstance = null;
    }

    const isNewFile =
        dbPath === ':memory:' ||
        !fs.existsSync(dbPath) ||
        fs.statSync(dbPath).size === 0;

    if (dbPath !== ':memory:') {
        const dir = path.dirname(dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    const db = new Database(dbPath);

    // Enable SQLite foreign key constraints (disabled by default in SQLite)
    db.pragma('foreign_keys = ON');

    // Execute schema definitions to automatically initialize tables
    const schemaSql = fs.readFileSync(SCHEMA_PATH, 'utf8');
    db.exec(schemaSql);

    const shouldSeed =
        options.seed !== undefined
            ? options.seed
            : isNewFile && process.env.SKIP_SEED !== 'true' && process.env.NODE_ENV !== 'test';

    if (shouldSeed) {
        seedSampleData(db);
    }

    dbInstance = db;
    return dbInstance;
}

/**
 * Returns the active SQLite database instance, initializing the default DB if needed.
 */
function getDb() {
    if (!dbInstance) {
        return initDatabase();
    }
    return dbInstance;
}

/**
 * Closes the active database connection (useful for graceful shutdown and test cleanup).
 */
function closeDatabase() {
    if (dbInstance) {
        dbInstance.close();
        dbInstance = null;
    }
}

module.exports = {
    DEFAULT_DB_PATH,
    initDatabase,
    getDb,
    closeDatabase,
    seedSampleData
};
