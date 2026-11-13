const { getDb } = require('../database/database');
const { AppError } = require('../middleware/errorHandler');
const {
    parsePositiveInt,
    validateRequiredString,
    validateEmail,
    ensureObjectBody
} = require('../middleware/validators');

/**
 * GET /players
 * Returns all registered players ordered by ID.
 */
function getAllPlayers(req, res) {
    const db = getDb();
    const players = db
        .prepare('SELECT id, name, email, sport FROM players ORDER BY id ASC')
        .all();

    return res.status(200).json(players);
}

/**
 * GET /players/:id
 * Returns a single player by ID.
 */
function getPlayerById(req, res) {
    const playerId = parsePositiveInt(req.params.id, 'Player ID');
    const db = getDb();

    const player = db
        .prepare('SELECT id, name, email, sport FROM players WHERE id = ?')
        .get(playerId);

    if (!player) {
        throw new AppError(404, 'Player not found.');
    }

    return res.status(200).json(player);
}

/**
 * POST /players
 * Creates a new player after validating name, email, and sport.
 */
function createPlayer(req, res) {
    const body = ensureObjectBody(req.body);
    const name = validateRequiredString(body.name, 'Player name');
    const email = validateEmail(body.email);
    const sport = validateRequiredString(body.sport, 'Player sport');

    const db = getDb();

    // Prevent duplicate email addresses (case-insensitive check)
    const existing = db
        .prepare('SELECT id FROM players WHERE LOWER(email) = LOWER(?)')
        .get(email);

    if (existing) {
        throw new AppError(409, 'A player with this email already exists.');
    }

    const result = db
        .prepare('INSERT INTO players (name, email, sport) VALUES (?, ?, ?)')
        .run(name, email, sport);

    const createdPlayer = db
        .prepare('SELECT id, name, email, sport FROM players WHERE id = ?')
        .get(result.lastInsertRowid);

    return res.status(201).json({
        message: 'Player created successfully.',
        player: createdPlayer
    });
}

/**
 * PUT /players/:id
 * Updates an existing player's details with input validation.
 */
function updatePlayer(req, res) {
    const playerId = parsePositiveInt(req.params.id, 'Player ID');
    const body = ensureObjectBody(req.body);

    const hasName = body.name !== undefined;
    const hasEmail = body.email !== undefined;
    const hasSport = body.sport !== undefined;

    if (!hasName && !hasEmail && !hasSport) {
        throw new AppError(
            400,
            'Provide at least one valid field (name, email, or sport) to update.'
        );
    }

    const db = getDb();
    const existingPlayer = db
        .prepare('SELECT id, name, email, sport FROM players WHERE id = ?')
        .get(playerId);

    if (!existingPlayer) {
        throw new AppError(404, 'Player not found.');
    }

    const updatedName = hasName
        ? validateRequiredString(body.name, 'Player name')
        : existingPlayer.name;
    const updatedEmail = hasEmail
        ? validateEmail(body.email)
        : existingPlayer.email;
    const updatedSport = hasSport
        ? validateRequiredString(body.sport, 'Player sport')
        : existingPlayer.sport;

    // If email changed, verify no other player owns the new email
    if (hasEmail) {
        const duplicateEmail = db
            .prepare('SELECT id FROM players WHERE LOWER(email) = LOWER(?) AND id != ?')
            .get(updatedEmail, playerId);

        if (duplicateEmail) {
            throw new AppError(409, 'Another player with this email already exists.');
        }
    }

    db.prepare('UPDATE players SET name = ?, email = ?, sport = ? WHERE id = ?').run(
        updatedName,
        updatedEmail,
        updatedSport,
        playerId
    );

    const updatedPlayer = db
        .prepare('SELECT id, name, email, sport FROM players WHERE id = ?')
        .get(playerId);

    return res.status(200).json({
        message: 'Player updated successfully.',
        player: updatedPlayer
    });
}

/**
 * DELETE /players/:id
 * Removes a player if they are not referenced by active or historical loan records.
 */
function deletePlayer(req, res) {
    const playerId = parsePositiveInt(req.params.id, 'Player ID');
    const db = getDb();

    const existingPlayer = db
        .prepare('SELECT id, name, email, sport FROM players WHERE id = ?')
        .get(playerId);

    if (!existingPlayer) {
        throw new AppError(404, 'Player not found.');
    }

    // Check active unreturned loans first for a specific error message
    const activeLoan = db
        .prepare('SELECT id FROM loans WHERE player_id = ? AND return_date IS NULL LIMIT 1')
        .get(playerId);

    if (activeLoan) {
        throw new AppError(409, 'Cannot delete player while they have active unreturned loans.');
    }

    // Respect foreign key integrity (ON DELETE RESTRICT) for historical loan records
    const anyLoan = db
        .prepare('SELECT id FROM loans WHERE player_id = ? LIMIT 1')
        .get(playerId);

    if (anyLoan) {
        throw new AppError(
            409,
            'Cannot delete player because they are referenced by existing loan records.'
        );
    }

    db.prepare('DELETE FROM players WHERE id = ?').run(playerId);

    return res.status(200).json({
        message: 'Player deleted successfully.',
        deletedPlayer: existingPlayer
    });
}

module.exports = {
    getAllPlayers,
    getPlayerById,
    createPlayer,
    updatePlayer,
    deletePlayer
};
