const express = require('express');
const {
  registerUser,
  registerVendor,
  loginUser,
  loginAdmin,
  getProfile,
  logoutUser,
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/register', registerUser);
router.post('/vendor/register', registerVendor);
router.post('/login', loginUser);
router.post('/admin/login', loginAdmin);
router.get('/me', protect, getProfile);
router.get('/profile', protect, getProfile);
router.post('/logout', protect, logoutUser);

module.exports = router;
