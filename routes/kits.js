const express = require('express');
const {
    getAllKits,
    getKitsSummary,
    getKitById,
    createKit,
    updateKit,
    deleteKit
} = require('../controllers/kitsController');

const router = express.Router();

// IMPORTANT: /summary must be defined before /:id so Express does not treat "summary" as an ID
router.get('/summary', getKitsSummary);
router.get('/', getAllKits);
router.get('/:id', getKitById);
router.post('/', createKit);
router.put('/:id', updateKit);
router.delete('/:id', deleteKit);

module.exports = router;
