const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const { initDatabase, getDb, closeDatabase } = require('../database/database');
const { createApp } = require('../server');

// Always use an isolated test database so the main application database is never touched
const TEST_DB_PATH = path.join(__dirname, 'test-sportsshed.db');

let server;
let baseUrl;

/**
 * Helper to make JSON HTTP requests against the running Express test server.
 */
async function apiRequest(method, urlPath, body) {
    const options = {
        method,
        headers: {}
    };

    if (body !== undefined) {
        options.headers['Content-Type'] = 'application/json';
        options.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    const response = await fetch(`${baseUrl}${urlPath}`, options);
    const data = await response.json();
    return { status: response.status, data };
}

/**
 * Resets all records in the isolated test database while keeping schema tables intact.
 */
function clearTestTables() {
    const db = getDb();
    db.exec('DELETE FROM loans; DELETE FROM kits; DELETE FROM players;');
}

describe('SportsShed Backend API & Summary Tests', () => {
    before(async () => {
        if (fs.existsSync(TEST_DB_PATH)) {
            fs.unlinkSync(TEST_DB_PATH);
        }

        // Initialize separate test database with seeding disabled
        initDatabase(TEST_DB_PATH, { seed: false });
        const app = createApp();
        server = http.createServer(app);

        await new Promise((resolve) => {
            server.listen(0, '127.0.0.1', () => {
                const { port } = server.address();
                baseUrl = `http://127.0.0.1:${port}`;
                resolve();
            });
        });
    });

    beforeEach(() => {
        clearTestTables();
    });

    after(async () => {
        await new Promise((resolve) => server.close(resolve));
        closeDatabase();
        if (fs.existsSync(TEST_DB_PATH)) {
            fs.unlinkSync(TEST_DB_PATH);
        }
    });

    describe('Database Constraints & Schema', () => {
        it('should have exactly 3 user tables and foreign keys enabled', () => {
            const db = getDb();
            const fkStatus = db.pragma('foreign_keys', { simple: true });
            assert.equal(fkStatus, 1);

            const tables = db
                .prepare(
                    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC"
                )
                .all()
                .map((row) => row.name);

            assert.deepEqual(tables, ['kits', 'loans', 'players']);
        });
    });

    describe('Required Tests for GET /kits/summary', () => {
        it('TEST 1: returns accurate counts when adding kits in two sport categories (4 Cricket, 3 Football)', async () => {
            const cricketKits = [
                { name: 'Cricket Bat 1', sport: 'Cricket' },
                { name: 'Cricket Bat 2', sport: 'Cricket' },
                { name: 'Cricket Ball', sport: 'Cricket' },
                { name: 'Cricket Pads', sport: 'Cricket' }
            ];
            const footballKits = [
                { name: 'Football 1', sport: 'Football' },
                { name: 'Football 2', sport: 'Football' },
                { name: 'Football Gloves', sport: 'Football' }
            ];

            for (const kit of [...cricketKits, ...footballKits]) {
                const res = await apiRequest('POST', '/kits', kit);
                assert.equal(res.status, 201);
                assert.equal(res.data.kit.status, 'Available');
            }

            const summaryRes = await apiRequest('GET', '/kits/summary');
            assert.equal(summaryRes.status, 200);
            assert.deepEqual(summaryRes.data, [
                { sport: 'Cricket', count: 4 },
                { sport: 'Football', count: 3 }
            ]);
        });

        it('TEST 2: accurately aggregates more than 200 kits across multiple sports with no truncation', async () => {
            const sportDistribution = [
                { sport: 'Badminton', qty: 30 },
                { sport: 'Basketball', qty: 45 },
                { sport: 'Cricket', qty: 60 },
                { sport: 'Football', qty: 55 },
                { sport: 'Tennis', qty: 35 }
            ];
            // Total = 225 kits (> 200)
            const db = getDb();
            const insertStmt = db.prepare(
                "INSERT INTO kits (name, sport, status) VALUES (?, ?, 'Available')"
            );
            const insertMany = db.transaction(() => {
                for (const { sport, qty } of sportDistribution) {
                    for (let i = 1; i <= qty; i++) {
                        insertStmt.run(`${sport} Kit #${i}`, sport);
                    }
                }
            });
            insertMany();

            const summaryRes = await apiRequest('GET', '/kits/summary');
            assert.equal(summaryRes.status, 200);
            assert.deepEqual(summaryRes.data, [
                { sport: 'Badminton', count: 30 },
                { sport: 'Basketball', count: 45 },
                { sport: 'Cricket', count: 60 },
                { sport: 'Football', count: 55 },
                { sport: 'Tennis', count: 35 }
            ]);

            const totalCount = summaryRes.data.reduce((sum, item) => sum + item.count, 0);
            assert.equal(totalCount, 225);
        });

        it('TEST 3: returns empty array [] when database has no kit records', async () => {
            // Ensure kits table is empty
            const kitsBefore = await apiRequest('GET', '/kits');
            assert.equal(kitsBefore.status, 200);
            assert.deepEqual(kitsBefore.data, []);

            const summaryRes = await apiRequest('GET', '/kits/summary');
            assert.equal(summaryRes.status, 200);
            assert.deepEqual(summaryRes.data, []);
        });
    });

    describe('Kits CRUD & Sport Search API', () => {
        it('supports adding, reading, updating, and deleting kits', async () => {
            // Create
            const createRes = await apiRequest('POST', '/kits', {
                name: 'English Willow Bat',
                sport: 'Cricket'
            });
            assert.equal(createRes.status, 201);
            assert.equal(createRes.data.kit.name, 'English Willow Bat');
            assert.equal(createRes.data.kit.sport, 'Cricket');
            assert.equal(createRes.data.kit.status, 'Available');

            const kitId = createRes.data.kit.id;

            // Read one
            const getOneRes = await apiRequest('GET', `/kits/${kitId}`);
            assert.equal(getOneRes.status, 200);
            assert.equal(getOneRes.data.id, kitId);

            // Update
            const updateRes = await apiRequest('PUT', `/kits/${kitId}`, {
                name: 'Pro Willow Bat',
                sport: 'Cricket',
                status: 'Available'
            });
            assert.equal(updateRes.status, 200);
            assert.equal(updateRes.data.kit.name, 'Pro Willow Bat');

            // Delete
            const deleteRes = await apiRequest('DELETE', `/kits/${kitId}`);
            assert.equal(deleteRes.status, 200);

            // Verify deleted
            const afterDeleteRes = await apiRequest('GET', `/kits/${kitId}`);
            assert.equal(afterDeleteRes.status, 404);
        });

        it('supports case-insensitive sport search and SQL injection resistance via ?search=', async () => {
            await apiRequest('POST', '/kits', { name: 'Cricket Bat', sport: 'Cricket' });
            await apiRequest('POST', '/kits', { name: 'Cricket Ball', sport: 'Cricket' });
            await apiRequest('POST', '/kits', { name: 'Match Football', sport: 'Football' });

            // Case-insensitive search for cricket
            const cricketLower = await apiRequest('GET', '/kits?search=cricket');
            assert.equal(cricketLower.status, 200);
            assert.equal(cricketLower.data.length, 2);

            const footballUpper = await apiRequest('GET', '/kits?search=FOOTBALL');
            assert.equal(footballUpper.status, 200);
            assert.equal(footballUpper.data.length, 1);
            assert.equal(footballUpper.data[0].name, 'Match Football');

            // Non-existent sport returns []
            const noMatch = await apiRequest('GET', '/kits?search=Hockey');
            assert.equal(noMatch.status, 200);
            assert.deepEqual(noMatch.data, []);

            // SQL injection attempt should be safely parameterized and return []
            const injection = await apiRequest(
                'GET',
                `/kits?search=${encodeURIComponent("' OR '1'='1")}`
            );
            assert.equal(injection.status, 200);
            assert.deepEqual(injection.data, []);
        });
    });

    describe('Players, Loans, Issue/Return Logic & JOIN Endpoint', () => {
        it('handles complete player CRUD and loan issue/return lifecycle with JOIN details', async () => {
            // Create player
            const playerRes = await apiRequest('POST', '/players', {
                name: 'Vikram Singh',
                email: 'Vikram.Singh@College.EDU',
                sport: 'Cricket'
            });
            assert.equal(playerRes.status, 201);
            assert.equal(playerRes.data.player.email, 'vikram.singh@college.edu');
            const playerId = playerRes.data.player.id;

            // Update player
            const updatePlayerRes = await apiRequest('PUT', `/players/${playerId}`, {
                sport: 'Football'
            });
            assert.equal(updatePlayerRes.status, 200);
            assert.equal(updatePlayerRes.data.player.sport, 'Football');

            // Create kit
            const kitRes = await apiRequest('POST', '/kits', {
                name: 'Match Football',
                sport: 'Football'
            });
            assert.equal(kitRes.status, 201);
            const kitId = kitRes.data.kit.id;

            // Issue kit
            const issueRes = await apiRequest('POST', '/loans', {
                player_id: playerId,
                kit_id: kitId,
                loan_date: '2026-11-10'
            });
            assert.equal(issueRes.status, 201);
            assert.equal(issueRes.data.loan.return_date, null);
            const loanId = issueRes.data.loan.id;

            // Kit status must now be Issued
            const kitAfterIssue = await apiRequest('GET', `/kits/${kitId}`);
            assert.equal(kitAfterIssue.status, 200);
            assert.equal(kitAfterIssue.data.status, 'Issued');

            // Attempting to issue an already-issued kit returns 409 Conflict
            const doubleIssue = await apiRequest('POST', '/loans', {
                player_id: playerId,
                kit_id: kitId
            });
            assert.equal(doubleIssue.status, 409);

            // Attempting to delete an issued kit returns 409 Conflict
            const deleteIssuedKit = await apiRequest('DELETE', `/kits/${kitId}`);
            assert.equal(deleteIssuedKit.status, 409);

            // Check 3-table JOIN endpoint before return
            const detailsRes = await apiRequest('GET', '/loans/details');
            assert.equal(detailsRes.status, 200);
            assert.equal(detailsRes.data.length, 1);
            assert.deepEqual(detailsRes.data[0], {
                loan_id: loanId,
                player_id: playerId,
                player_name: 'Vikram Singh',
                kit_id: kitId,
                kit_name: 'Match Football',
                sport: 'Football',
                loan_date: '2026-11-10',
                return_date: null
            });

            // Return kit
            const returnRes = await apiRequest('PUT', `/loans/${loanId}`, {
                return_date: '2026-11-12'
            });
            assert.equal(returnRes.status, 200);
            assert.equal(returnRes.data.loan.return_date, '2026-11-12');

            // Kit status must now be back to Available
            const kitAfterReturn = await apiRequest('GET', `/kits/${kitId}`);
            assert.equal(kitAfterReturn.status, 200);
            assert.equal(kitAfterReturn.data.status, 'Available');

            // Returning an already-returned loan returns 409 Conflict
            const doubleReturn = await apiRequest('PUT', `/loans/${loanId}`, {
                return_date: '2026-11-13'
            });
            assert.equal(doubleReturn.status, 409);

            // Delete loan and then player & kit cleanly
            const deleteLoanRes = await apiRequest('DELETE', `/loans/${loanId}`);
            assert.equal(deleteLoanRes.status, 200);

            const deleteKitRes = await apiRequest('DELETE', `/kits/${kitId}`);
            assert.equal(deleteKitRes.status, 200);

            const deletePlayerRes = await apiRequest('DELETE', `/players/${playerId}`);
            assert.equal(deletePlayerRes.status, 200);
        });
    });

    describe('Validation & Error Handling', () => {
        it('rejects invalid inputs with 400 Bad Request', async () => {
            // Empty kit name
            const emptyKitName = await apiRequest('POST', '/kits', {
                name: '   ',
                sport: 'Cricket'
            });
            assert.equal(emptyKitName.status, 400);

            // Empty sport
            const emptySport = await apiRequest('POST', '/kits', {
                name: 'Bat',
                sport: ''
            });
            assert.equal(emptySport.status, 400);

            // Invalid kit status on create and update
            const badStatus = await apiRequest('POST', '/kits', {
                name: 'Bat',
                sport: 'Cricket',
                status: 'Broken'
            });
            assert.equal(badStatus.status, 400);

            const validKit = await apiRequest('POST', '/kits', {
                name: 'Bat',
                sport: 'Cricket'
            });
            const badUpdateStatus = await apiRequest(
                'PUT',
                `/kits/${validKit.data.kit.id}`,
                { status: 'Lost' }
            );
            assert.equal(badUpdateStatus.status, 400);

            // Empty player name & invalid email
            const emptyPlayerName = await apiRequest('POST', '/players', {
                name: '',
                email: 'test@college.edu',
                sport: 'Cricket'
            });
            assert.equal(emptyPlayerName.status, 400);

            const badEmail = await apiRequest('POST', '/players', {
                name: 'Asha',
                email: 'not-an-email',
                sport: 'Cricket'
            });
            assert.equal(badEmail.status, 400);

            // Malformed JSON
            const badJson = await apiRequest('POST', '/kits', '{bad json');
            assert.equal(badJson.status, 400);
        });

        it('rejects invalid IDs with 400 and non-existent IDs with 404', async () => {
            assert.equal((await apiRequest('GET', '/players/abc')).status, 400);
            assert.equal((await apiRequest('GET', '/kits/-5')).status, 400);
            assert.equal((await apiRequest('GET', '/loans/0')).status, 400);

            assert.equal((await apiRequest('GET', '/players/9999')).status, 404);
            assert.equal((await apiRequest('GET', '/kits/9999')).status, 404);
            assert.equal((await apiRequest('GET', '/loans/9999')).status, 404);

            // Loan referencing non-existent player or kit returns 404
            const validPlayer = await apiRequest('POST', '/players', {
                name: 'Maya',
                email: 'maya@college.edu',
                sport: 'Tennis'
            });
            const validKit = await apiRequest('POST', '/kits', {
                name: 'Tennis Racket',
                sport: 'Tennis'
            });

            const missingPlayerLoan = await apiRequest('POST', '/loans', {
                player_id: 9999,
                kit_id: validKit.data.kit.id
            });
            assert.equal(missingPlayerLoan.status, 404);

            const missingKitLoan = await apiRequest('POST', '/loans', {
                player_id: validPlayer.data.player.id,
                kit_id: 9999
            });
            assert.equal(missingKitLoan.status, 404);
        });

        it('enforces foreign keys in SQLite, prevents duplicate emails, and restores kit status when deleting active loan', async () => {
            const db = getDb();

            // Direct SQL foreign key enforcement check
            assert.throws(() => {
                db.prepare(
                    "INSERT INTO loans (player_id, kit_id, loan_date) VALUES (999, 999, '2026-11-12')"
                ).run();
            }, /FOREIGN KEY constraint failed/);

            // Duplicate email conflict
            const p1 = await apiRequest('POST', '/players', {
                name: 'Riya Patel',
                email: 'riya@college.edu',
                sport: 'Badminton'
            });
            assert.equal(p1.status, 201);

            const duplicatePlayer = await apiRequest('POST', '/players', {
                name: 'Riya Duplicate',
                email: 'RIYA@college.edu',
                sport: 'Tennis'
            });
            assert.equal(duplicatePlayer.status, 409);

            // Deleting an active loan must reset the kit back to Available
            const kit = await apiRequest('POST', '/kits', {
                name: 'Badminton Racket',
                sport: 'Badminton'
            });
            const kitId = kit.data.kit.id;

            const loan = await apiRequest('POST', '/loans', {
                player_id: p1.data.player.id,
                kit_id: kitId
            });
            assert.equal(loan.status, 201);
            assert.equal((await apiRequest('GET', `/kits/${kitId}`)).data.status, 'Issued');

            const deleteLoan = await apiRequest('DELETE', `/loans/${loan.data.loan.id}`);
            assert.equal(deleteLoan.status, 200);
            assert.equal((await apiRequest('GET', `/kits/${kitId}`)).data.status, 'Available');

            // Unknown route returns 404 without stack trace
            const unknown = await apiRequest('GET', '/nonexistent-route');
            assert.equal(unknown.status, 404);
            assert.equal('stack' in unknown.data, false);
        });
    });
});
