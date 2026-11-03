const prisma = require('../lib/prisma');
const { verifyToken } = require('../lib/auth');

async function protect(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token provided' });
  }

  try {
    const decoded = verifyToken(token);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: { vendorProfile: true },
    });

    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    // Role always comes from the DB, never from the token payload.
    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      vendorProfile: user.vendorProfile,
    };

    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

const authorize = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ message: `${roles.join(' or ')} access required` });
  }
  return next();
};

const admin = authorize('ADMIN');
const adminOrVendor = authorize('ADMIN', 'VENDOR');

// Vendors may only sell once an admin approved their store.
const approvedVendor = (req, res, next) => {
  if (req.user?.role !== 'VENDOR') {
    return res.status(403).json({ message: 'VENDOR access required' });
  }
  if (!req.user.vendorProfile?.isApproved) {
    return res.status(403).json({ message: 'Your store is awaiting admin approval' });
  }
  return next();
};

module.exports = { protect, authorize, admin, adminOrVendor, approvedVendor };
