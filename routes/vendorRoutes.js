const express = require('express');
const { protect, admin, approvedVendor } = require('../middleware/authMiddleware');
const v = require('../controllers/vendorController');
const p = require('../controllers/productController');

const router = express.Router();

router.get('/approved', v.getApprovedVendors);
router.get('/me', protect, v.getMyVendorStatus);
router.get('/requests', protect, admin, v.getVendorRequests);
router.put('/:id/status', protect, admin, v.updateVendorStatus);

router.get('/products', protect, approvedVendor, v.getVendorProducts);
router.post('/products', protect, approvedVendor, p.createProduct);
router.put('/products/:id', protect, approvedVendor, p.updateProduct);
router.delete('/products/:id', protect, approvedVendor, p.deleteProduct);

router.get('/dashboard/stats', protect, approvedVendor, v.getVendorDashboardStats);

module.exports = router;
