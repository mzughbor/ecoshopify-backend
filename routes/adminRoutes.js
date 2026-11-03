const express = require('express');
const { protect, admin } = require('../middleware/authMiddleware');
const a = require('../controllers/adminController');

const router = express.Router();

router.use(protect, admin);
router.get('/users', a.getUsers);
router.post('/users', a.createAdmin);
router.patch('/users/:id/role', a.updateUserRole);

module.exports = router;
