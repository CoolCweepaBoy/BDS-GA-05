const { AppError } = require('./errorHandler');

const VALID_KIT_STATUSES = ['Available', 'Issued'];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parses and validates a positive integer ID from route params or request body.
 * Throws a 400 AppError if invalid.
 */
function parsePositiveInt(value, fieldName = 'ID') {
    if (value === undefined || value === null || value === '') {
        throw new AppError(400, `${fieldName} is required.`);
    }

    const str = String(value).trim();
    if (!/^\d+$/.test(str)) {
        throw new AppError(400, `${fieldName} must be a valid positive integer.`);
    }

    const parsed = Number(str);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        throw new AppError(400, `${fieldName} must be a positive integer greater than 0.`);
    }

    return parsed;
}

/**
 * Validates that a field is a non-empty string and returns its trimmed value.
 */
function validateRequiredString(value, fieldName) {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new AppError(400, `${fieldName} cannot be empty.`);
    }
    return value.trim();
}

/**
 * Validates an email address format and normalizes it to trimmed lowercase.
 */
function validateEmail(value) {
    const trimmed = validateRequiredString(value, 'Player email');
    if (!EMAIL_REGEX.test(trimmed)) {
        throw new AppError(400, 'Player email must be a valid email address.');
    }
    return trimmed.toLowerCase();
}

/**
 * Validates kit status against allowed values ('Available' or 'Issued').
 */
function validateKitStatus(value) {
    if (typeof value !== 'string' || !VALID_KIT_STATUSES.includes(value.trim())) {
        throw new AppError(
            400,
            `Invalid kit status. Allowed values are: ${VALID_KIT_STATUSES.join(', ')}.`
        );
    }
    return value.trim();
}

/**
 * Validates a YYYY-MM-DD calendar date string (e.g., 2026-11-12).
 */
function validateDateString(value, fieldName) {
    const trimmed = validateRequiredString(value, fieldName);
    if (!DATE_REGEX.test(trimmed)) {
        throw new AppError(400, `${fieldName} must be a valid date in YYYY-MM-DD format.`);
    }

    const [year, month, day] = trimmed.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() + 1 !== month ||
        date.getUTCDate() !== day
    ) {
        throw new AppError(400, `${fieldName} is not a valid calendar date.`);
    }

    return trimmed;
}

/**
 * Returns today's UTC date in YYYY-MM-DD format.
 */
function getTodayDateString() {
    return new Date().toISOString().split('T')[0];
}

/**
 * Ensures req.body is a plain JSON object before accessing fields.
 */
function ensureObjectBody(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new AppError(400, 'Request body must be a valid JSON object.');
    }
    return body;
}

module.exports = {
    VALID_KIT_STATUSES,
    parsePositiveInt,
    validateRequiredString,
    validateEmail,
    validateKitStatus,
    validateDateString,
    getTodayDateString,
    ensureObjectBody
};
