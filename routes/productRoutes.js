const express = require('express');
const { protect, admin, adminOrVendor } = require('../middleware/authMiddleware');
const p = require('../controllers/productController');

const router = express.Router();

router.get('/', p.getProducts);
router.post('/', protect, adminOrVendor, p.createProduct);
router.get('/:id', p.getProductById);
router.put('/:id', protect, adminOrVendor, p.updateProduct);
router.delete('/:id', protect, adminOrVendor, p.deleteProduct);

module.exports = router;
