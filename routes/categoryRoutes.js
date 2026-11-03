const express = require('express');
const { protect, admin } = require('../middleware/authMiddleware');
const c = require('../controllers/categoryController');

const router = express.Router();

router.get('/', c.getCategories);
router.get('/tree', c.getCategoryTree);
router.post('/', protect, admin, c.createCategory);

module.exports = router;
