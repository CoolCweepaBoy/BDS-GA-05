/**
 * Custom error class for operational HTTP errors with an explicit status code.
 */
class AppError extends Error {
    constructor(statusCode, message) {
        super(message);
        this.name = 'AppError';
        this.statusCode = statusCode;
    }
}

/**
 * Middleware to handle requests to undefined routes (404 Not Found).
 */
function notFoundHandler(req, res) {
    res.status(404).json({
        error: `Route not found: ${req.method} ${req.originalUrl}`
    });
}

/**
 * Centralized Express error-handling middleware.
 * Ensures clear JSON errors are returned without leaking stack traces or DB internals.
 */
function errorHandler(err, req, res, next) {
    if (res.headersSent) {
        return next(err);
    }

    // Handle malformed JSON request bodies from express.json()
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        return res.status(400).json({
            error: 'Invalid JSON payload in request body.'
        });
    }

    // Handle known application errors thrown by controllers/validators
    if (err instanceof AppError) {
        return res.status(err.statusCode).json({
            error: err.message
        });
    }

    // Map SQLite constraint errors safely without exposing raw SQLite internals
    if (err && typeof err.code === 'string' && err.code.startsWith('SQLITE_CONSTRAINT')) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(409).json({
                error: 'A record with this unique value already exists.'
            });
        }
        if (err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
            return res.status(409).json({
                error: 'Operation violates a database relationship constraint.'
            });
        }
        return res.status(400).json({
            error: 'Input violates database validation rules.'
        });
    }

    // Log unexpected internal errors on the server only (avoid noisy stack logs during expected tests if needed)
    if (process.env.NODE_ENV !== 'test') {
        console.error('Unexpected server error:', err);
    }

    return res.status(500).json({
        error: 'Internal server error.'
    });
}

module.exports = {
    AppError,
    notFoundHandler,
    errorHandler
};
