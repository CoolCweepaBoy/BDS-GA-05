const express = require('express');
const {
    getAllLoans,
    getLoanDetails,
    getLoanById,
    createLoan,
    updateLoan,
    deleteLoan
} = require('../controllers/loansController');

const router = express.Router();

// IMPORTANT: /details must be defined before /:id so Express does not treat "details" as an ID
router.get('/details', getLoanDetails);
router.get('/', getAllLoans);
router.get('/:id', getLoanById);
router.post('/', createLoan);
router.put('/:id', updateLoan);
router.delete('/:id', deleteLoan);

module.exports = router;
