const { getDb } = require('../database/database');
const { AppError } = require('../middleware/errorHandler');
const {
    parsePositiveInt,
    validateDateString,
    getTodayDateString,
    ensureObjectBody
} = require('../middleware/validators');

/**
 * GET /loans
 * Returns all loan records ordered by ID.
 */
function getAllLoans(req, res) {
    const db = getDb();
    const loans = db
        .prepare(
            'SELECT id, player_id, kit_id, loan_date, return_date FROM loans ORDER BY id ASC'
        )
        .all();

    return res.status(200).json(loans);
}

/**
 * GET /loans/details
 * Combines loans, players, and kits using SQL INNER JOIN so callers receive
 * human-readable player and kit names alongside loan metadata.
 */
function getLoanDetails(req, res) {
    const db = getDb();

    // 3-table SQL JOIN connecting loans -> players and loans -> kits
    const details = db
        .prepare(
            `SELECT
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
             ORDER BY loans.id ASC`
        )
        .all();

    return res.status(200).json(details);
}

/**
 * GET /loans/:id
 * Returns a single loan record by ID.
 */
function getLoanById(req, res) {
    const loanId = parsePositiveInt(req.params.id, 'Loan ID');
    const db = getDb();

    const loan = db
        .prepare(
            'SELECT id, player_id, kit_id, loan_date, return_date FROM loans WHERE id = ?'
        )
        .get(loanId);

    if (!loan) {
        throw new AppError(404, 'Loan record not found.');
    }

    return res.status(200).json(loan);
}

/**
 * POST /loans
 * Issues an available kit to an existing player inside an atomic transaction.
 * Steps:
 * 1. Verify player exists
 * 2. Verify kit exists
 * 3. Verify kit is 'Available' (no double-issuing)
 * 4. Create loan record
 * 5. Update kit status to 'Issued'
 */
function createLoan(req, res) {
    const body = ensureObjectBody(req.body);
    const playerId = parsePositiveInt(body.player_id, 'player_id');
    const kitId = parsePositiveInt(body.kit_id, 'kit_id');
    const loanDate =
        body.loan_date !== undefined
            ? validateDateString(body.loan_date, 'loan_date')
            : getTodayDateString();

    const db = getDb();

    const issueTransaction = db.transaction(() => {
        // 1. Verify that the player exists
        const player = db
            .prepare('SELECT id, name FROM players WHERE id = ?')
            .get(playerId);

        if (!player) {
            throw new AppError(404, 'Player not found.');
        }

        // 2. Verify that the kit exists
        const kit = db
            .prepare('SELECT id, name, status FROM kits WHERE id = ?')
            .get(kitId);

        if (!kit) {
            throw new AppError(404, 'Kit not found.');
        }

        // 3. Ensure kit is Available and has no unreturned loan
        const activeLoan = db
            .prepare('SELECT id FROM loans WHERE kit_id = ? AND return_date IS NULL LIMIT 1')
            .get(kitId);

        if (kit.status !== 'Available' || activeLoan) {
            throw new AppError(409, 'Kit is already issued and cannot be issued again.');
        }

        // 4. Create loan record
        const result = db
            .prepare(
                'INSERT INTO loans (player_id, kit_id, loan_date, return_date) VALUES (?, ?, ?, NULL)'
            )
            .run(playerId, kitId, loanDate);

        // 5. Mark kit as Issued
        db.prepare("UPDATE kits SET status = 'Issued' WHERE id = ?").run(kitId);

        return db
            .prepare(
                'SELECT id, player_id, kit_id, loan_date, return_date FROM loans WHERE id = ?'
            )
            .get(result.lastInsertRowid);
    });

    const createdLoan = issueTransaction();

    return res.status(201).json({
        message: 'Kit issued successfully.',
        loan: createdLoan
    });
}

/**
 * PUT /loans/:id
 * Updates a loan or records a kit return inside a transaction.
 * When recording a return (via return_date or returned: true):
 * 1. Find the active loan
 * 2. Update return_date
 * 3. Change the kit status back to 'Available'
 */
function updateLoan(req, res) {
    const loanId = parsePositiveInt(req.params.id, 'Loan ID');
    const body = ensureObjectBody(req.body);

    const hasReturnDate = body.return_date !== undefined;
    const hasReturnedFlag = body.returned !== undefined;
    const hasLoanDate = body.loan_date !== undefined;
    const hasPlayerId = body.player_id !== undefined;
    const hasKitId = body.kit_id !== undefined;

    if (!hasReturnDate && !hasReturnedFlag && !hasLoanDate && !hasPlayerId && !hasKitId) {
        throw new AppError(
            400,
            'Provide return_date (YYYY-MM-DD), returned: true, or loan fields to update.'
        );
    }

    let effectiveReturnDate;
    if (hasReturnDate) {
        if (body.return_date === null) {
            throw new AppError(
                400,
                'return_date cannot be null; provide a valid date in YYYY-MM-DD format.'
            );
        }
        effectiveReturnDate = validateDateString(body.return_date, 'return_date');
    } else if (hasReturnedFlag) {
        if (body.returned !== true) {
            throw new AppError(400, 'returned must be boolean true when recording a return.');
        }
        effectiveReturnDate = getTodayDateString();
    }

    const nextLoanDate = hasLoanDate
        ? validateDateString(body.loan_date, 'loan_date')
        : undefined;
    const nextPlayerId = hasPlayerId
        ? parsePositiveInt(body.player_id, 'player_id')
        : undefined;
    const nextKitId = hasKitId
        ? parsePositiveInt(body.kit_id, 'kit_id')
        : undefined;

    const db = getDb();

    const updateTransaction = db.transaction(() => {
        // 1. Find the loan record
        const existingLoan = db
            .prepare(
                'SELECT id, player_id, kit_id, loan_date, return_date FROM loans WHERE id = ?'
            )
            .get(loanId);

        if (!existingLoan) {
            throw new AppError(404, 'Loan record not found.');
        }

        // Validate referenced player if changing player_id
        const finalPlayerId = nextPlayerId ?? existingLoan.player_id;
        if (nextPlayerId !== undefined && nextPlayerId !== existingLoan.player_id) {
            const player = db
                .prepare('SELECT id FROM players WHERE id = ?')
                .get(nextPlayerId);
            if (!player) {
                throw new AppError(404, 'Player not found.');
            }
        }

        // Validate referenced kit if changing kit_id
        const finalKitId = nextKitId ?? existingLoan.kit_id;
        if (nextKitId !== undefined && nextKitId !== existingLoan.kit_id) {
            if (effectiveReturnDate !== undefined) {
                throw new AppError(400, 'Cannot change kit_id while recording a loan return.');
            }
            if (existingLoan.return_date !== null) {
                throw new AppError(409, 'Cannot change kit_id on an already-returned loan.');
            }

            const targetKit = db
                .prepare('SELECT id, status FROM kits WHERE id = ?')
                .get(nextKitId);
            if (!targetKit) {
                throw new AppError(404, 'Kit not found.');
            }

            if (targetKit.status !== 'Available') {
                throw new AppError(409, 'Target kit is already issued.');
            }

            // Release previous kit and issue the new kit atomically
            db.prepare("UPDATE kits SET status = 'Available' WHERE id = ?").run(
                existingLoan.kit_id
            );
            db.prepare("UPDATE kits SET status = 'Issued' WHERE id = ?").run(nextKitId);
        }

        const finalLoanDate = nextLoanDate ?? existingLoan.loan_date;

        // Handle kit return
        if (effectiveReturnDate !== undefined) {
            if (existingLoan.return_date !== null) {
                throw new AppError(409, 'This kit loan has already been returned.');
            }

            // 2. Update return_date on the loan
            db.prepare(
                'UPDATE loans SET player_id = ?, kit_id = ?, loan_date = ?, return_date = ? WHERE id = ?'
            ).run(finalPlayerId, finalKitId, finalLoanDate, effectiveReturnDate, loanId);

            // 3. Change kit status back to Available
            db.prepare("UPDATE kits SET status = 'Available' WHERE id = ?").run(
                existingLoan.kit_id
            );
        } else {
            db.prepare(
                'UPDATE loans SET player_id = ?, kit_id = ?, loan_date = ? WHERE id = ?'
            ).run(finalPlayerId, finalKitId, finalLoanDate, loanId);
        }

        return db
            .prepare(
                'SELECT id, player_id, kit_id, loan_date, return_date FROM loans WHERE id = ?'
            )
            .get(loanId);
    });

    const updatedLoan = updateTransaction();

    return res.status(200).json({
        message:
            effectiveReturnDate !== undefined
                ? 'Kit returned successfully.'
                : 'Loan updated successfully.',
        loan: updatedLoan
    });
}

/**
 * DELETE /loans/:id
 * Deletes a loan record. If the loan is still active, restores the kit status to 'Available'.
 */
function deleteLoan(req, res) {
    const loanId = parsePositiveInt(req.params.id, 'Loan ID');
    const db = getDb();

    const deleteTransaction = db.transaction(() => {
        const existingLoan = db
            .prepare(
                'SELECT id, player_id, kit_id, loan_date, return_date FROM loans WHERE id = ?'
            )
            .get(loanId);

        if (!existingLoan) {
            throw new AppError(404, 'Loan record not found.');
        }

        // Keep kit status consistent if an active loan is removed
        if (existingLoan.return_date === null) {
            db.prepare("UPDATE kits SET status = 'Available' WHERE id = ?").run(
                existingLoan.kit_id
            );
        }

        db.prepare('DELETE FROM loans WHERE id = ?').run(loanId);
        return existingLoan;
    });

    const deletedLoan = deleteTransaction();

    return res.status(200).json({
        message: 'Loan deleted successfully.',
        deletedLoan
    });
}

module.exports = {
    getAllLoans,
    getLoanDetails,
    getLoanById,
    createLoan,
    updateLoan,
    deleteLoan
};
