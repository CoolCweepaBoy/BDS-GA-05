const { getDb } = require('../database/database');
const { AppError } = require('../middleware/errorHandler');
const {
    parsePositiveInt,
    validateRequiredString,
    validateKitStatus,
    ensureObjectBody
} = require('../middleware/validators');

/**
 * Escapes LIKE wildcard characters (%, _, \) so user search text is treated literally.
 */
function escapeLikePattern(value) {
    return value.replace(/[\\%_]/g, '\\$&');
}

/**
 * GET /kits
 * GET /kits?search=Cricket
 * Returns all kits, or filters kits case-insensitively by sport when ?search= is provided.
 */
function getAllKits(req, res) {
    const db = getDb();
    const { search } = req.query;

    if (typeof search === 'string' && search.trim().length > 0) {
        const pattern = `%${escapeLikePattern(search.trim())}%`;
        // Parameterized SQL query prevents SQL injection; LOWER() ensures case-insensitive sport matching
        const matchingKits = db
            .prepare(
                `SELECT id, name, sport, status
                 FROM kits
                 WHERE LOWER(sport) LIKE LOWER(?) ESCAPE '\\'
                 ORDER BY id ASC`
            )
            .all(pattern);

        return res.status(200).json(matchingKits);
    }

    const kits = db
        .prepare('SELECT id, name, sport, status FROM kits ORDER BY id ASC')
        .all();

    return res.status(200).json(kits);
}

/**
 * GET /kits/summary
 * Uses SQL COUNT() and GROUP BY sport to return the total number of kits per sport.
 * Returns an empty array [] if no kits exist.
 */
function getKitsSummary(req, res) {
    const db = getDb();

    // SQL aggregation calculates kit counts directly in SQLite (no manual JS counting, no pagination limit)
    const summary = db
        .prepare(
            `SELECT sport, COUNT(*) AS count
             FROM kits
             GROUP BY sport
             ORDER BY sport ASC`
        )
        .all();

    return res.status(200).json(summary);
}

/**
 * GET /kits/:id
 * Returns a single kit by ID.
 */
function getKitById(req, res) {
    const kitId = parsePositiveInt(req.params.id, 'Kit ID');
    const db = getDb();

    const kit = db
        .prepare('SELECT id, name, sport, status FROM kits WHERE id = ?')
        .get(kitId);

    if (!kit) {
        throw new AppError(404, 'Kit not found.');
    }

    return res.status(200).json(kit);
}

/**
 * POST /kits
 * Adds a new sports kit. New kits default to 'Available' unless a valid status is specified.
 */
function createKit(req, res) {
    const body = ensureObjectBody(req.body);
    const name = validateRequiredString(body.name, 'Kit name');
    const sport = validateRequiredString(body.sport, 'Sport');
    const status =
        body.status !== undefined ? validateKitStatus(body.status) : 'Available';

    const db = getDb();

    const result = db
        .prepare('INSERT INTO kits (name, sport, status) VALUES (?, ?, ?)')
        .run(name, sport, status);

    const createdKit = db
        .prepare('SELECT id, name, sport, status FROM kits WHERE id = ?')
        .get(result.lastInsertRowid);

    return res.status(201).json({
        message: 'Kit added successfully.',
        kit: createdKit
    });
}

/**
 * PUT /kits/:id
 * Updates an existing kit after validating provided fields.
 */
function updateKit(req, res) {
    const kitId = parsePositiveInt(req.params.id, 'Kit ID');
    const body = ensureObjectBody(req.body);

    const hasName = body.name !== undefined;
    const hasSport = body.sport !== undefined;
    const hasStatus = body.status !== undefined;

    if (!hasName && !hasSport && !hasStatus) {
        throw new AppError(
            400,
            'Provide at least one valid field (name, sport, or status) to update.'
        );
    }

    const db = getDb();
    const existingKit = db
        .prepare('SELECT id, name, sport, status FROM kits WHERE id = ?')
        .get(kitId);

    if (!existingKit) {
        throw new AppError(404, 'Kit not found.');
    }

    const updatedName = hasName
        ? validateRequiredString(body.name, 'Kit name')
        : existingKit.name;
    const updatedSport = hasSport
        ? validateRequiredString(body.sport, 'Sport')
        : existingKit.sport;
    const updatedStatus = hasStatus
        ? validateKitStatus(body.status)
        : existingKit.status;

    db.prepare('UPDATE kits SET name = ?, sport = ?, status = ? WHERE id = ?').run(
        updatedName,
        updatedSport,
        updatedStatus,
        kitId
    );

    const updatedKit = db
        .prepare('SELECT id, name, sport, status FROM kits WHERE id = ?')
        .get(kitId);

    return res.status(200).json({
        message: 'Kit updated successfully.',
        kit: updatedKit
    });
}

/**
 * DELETE /kits/:id
 * Deletes a kit if it is not currently issued or referenced by existing loan records.
 */
function deleteKit(req, res) {
    const kitId = parsePositiveInt(req.params.id, 'Kit ID');
    const db = getDb();

    const existingKit = db
        .prepare('SELECT id, name, sport, status FROM kits WHERE id = ?')
        .get(kitId);

    if (!existingKit) {
        throw new AppError(404, 'Kit not found.');
    }

    const activeLoan = db
        .prepare('SELECT id FROM loans WHERE kit_id = ? AND return_date IS NULL LIMIT 1')
        .get(kitId);

    if (activeLoan || existingKit.status === 'Issued') {
        throw new AppError(409, 'Cannot delete kit while it is currently issued.');
    }

    const anyLoan = db
        .prepare('SELECT id FROM loans WHERE kit_id = ? LIMIT 1')
        .get(kitId);

    if (anyLoan) {
        throw new AppError(
            409,
            'Cannot delete kit because it is referenced by existing loan records.'
        );
    }

    db.prepare('DELETE FROM kits WHERE id = ?').run(kitId);

    return res.status(200).json({
        message: 'Kit deleted successfully.',
        deletedKit: existingKit
    });
}

module.exports = {
    getAllKits,
    getKitsSummary,
    getKitById,
    createKit,
    updateKit,
    deleteKit
};
