const express = require('express');
const { initDatabase, closeDatabase } = require('./database/database');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const playersRouter = require('./routes/players');
const kitsRouter = require('./routes/kits');
const loansRouter = require('./routes/loans');

/**
 * Creates and configures the Express application instance.
 */
function createApp() {
    const app = express();

    // Parse incoming JSON request bodies
    app.use(express.json());

    // Helpful root health/overview endpoint
    app.get('/', (req, res) => {
        res.status(200).json({
            project: 'SportsShed - Equipment Issue Management System',
            status: 'running',
            endpoints: {
                players: '/players',
                kits: '/kits',
                kitsSearch: '/kits?search=Cricket',
                kitsSummary: '/kits/summary',
                loans: '/loans',
                loanDetails: '/loans/details'
            }
        });
    });

    // Mount feature routes
    app.use('/players', playersRouter);
    app.use('/kits', kitsRouter);
    app.use('/loans', loansRouter);

    // Handle unmatched routes and centralized errors
    app.use(notFoundHandler);
    app.use(errorHandler);

    return app;
}

/**
 * Initializes the SQLite database automatically and starts the HTTP server.
 */
function startServer(port = process.env.PORT || 3000) {
    initDatabase();
    const app = createApp();

    const server = app.listen(port, () => {
        console.log(`SportsShed server is running at http://localhost:${port}`);
    });

    // Gracefully close DB connection on termination signals
    const shutdown = () => {
        server.close(() => {
            closeDatabase();
            process.exit(0);
        });
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    return server;
}

// Start the server only when executed directly (allows tests to import createApp safely)
if (require.main === module) {
    startServer();
}

module.exports = {
    createApp,
    startServer
};
