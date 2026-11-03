const prisma = require('../lib/prisma');

const fail = (res, error, label) => {
  console.error(`${label} error:`, error);
  return res.status(500).json({ message: `Unable to ${label}` });
};

const getMyVendorStatus = async (req, res) => {
  if (!req.user.vendorProfile) {
    return res.status(404).json({ message: 'No vendor profile for this account' });
  }
  return res.json({ vendorProfile: req.user.vendorProfile });
};

const getApprovedVendors = async (req, res) => {
  try {
    const vendors = await prisma.vendorProfile.findMany({
      where: { isApproved: true },
      select: { id: true, storeName: true, description: true },
    });
    return res.json({ vendors });
  } catch (error) {
    return fail(res, error, 'fetch vendors');
  }
};

// Admin: GET /api/vendors/requests?status=pending|approved
const getVendorRequests = async (req, res) => {
  try {
    const where = {};
    if (req.query.status === 'pending') where.isApproved = false;
    if (req.query.status === 'approved') where.isApproved = true;
    const vendors = await prisma.vendorProfile.findMany({
      where,
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ vendors });
  } catch (error) {
    return fail(res, error, 'fetch vendor requests');
  }
};

// Admin: PUT /api/vendors/:id/status  { isApproved: boolean }
const updateVendorStatus = async (req, res) => {
  try {
    if (typeof req.body.isApproved !== 'boolean') {
      return res.status(400).json({ message: 'isApproved (boolean) is required' });
    }
    const vendor = await prisma.vendorProfile.update({
      where: { id: req.params.id },
      data: { isApproved: req.body.isApproved },
    });
    return res.json({ message: 'Vendor status updated', vendor });
  } catch (error) {
    if (error?.code === 'P2025') return res.status(404).json({ message: 'Vendor not found' });
    return fail(res, error, 'update vendor status');
  }
};

// Vendor: own products
const getVendorProducts = async (req, res) => {
  try {
    const products = await prisma.product.findMany({
      where: { vendorId: req.user.vendorProfile.id },
      include: { category: true, brand: true },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ products });
  } catch (error) {
    return fail(res, error, 'fetch vendor products');
  }
};

const getVendorDashboardStats = async (req, res) => {
  try {
    const vendorId = req.user.vendorProfile.id;
    const [products, orders, revenue] = await Promise.all([
      prisma.product.count({ where: { vendorId } }),
      prisma.order.count({ where: { vendorId } }),
      prisma.order.aggregate({
        where: { vendorId, status: { not: 'CANCELLED' } },
        _sum: { totalAmount: true },
      }),
    ]);
    return res.json({ products, orders, revenue: revenue._sum.totalAmount || 0 });
  } catch (error) {
    return fail(res, error, 'fetch dashboard stats');
  }
};

module.exports = {
  getMyVendorStatus,
  getApprovedVendors,
  getVendorRequests,
  updateVendorStatus,
  getVendorProducts,
  getVendorDashboardStats,
};
