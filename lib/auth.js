const jwt = require('jsonwebtoken');

const getSecret = () => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not set in .env');
  }
  return process.env.JWT_SECRET;
};

// Where the frontend should send each role after register/login (mirrors Sellzy's role-based panels).
const ROLE_REDIRECTS = {
  CUSTOMER: '/my-account',
  VENDOR: '/vendor/dashboard',
  ADMIN: '/admin/dashboard',
};

const signToken = (user) =>
  jwt.sign({ userId: user.id, role: user.role }, getSecret(), { expiresIn: '7d' });

const verifyToken = (token) => jwt.verify(token, getSecret());

const sanitizeUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
  vendorProfile: user.vendorProfile || null,
});

const authResponse = (message, user) => ({
  message,
  token: signToken(user),
  user: sanitizeUser(user),
  redirectTo: ROLE_REDIRECTS[user.role] || '/',
});

module.exports = { signToken, verifyToken, sanitizeUser, authResponse, ROLE_REDIRECTS };
