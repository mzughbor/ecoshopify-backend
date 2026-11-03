const prisma = require('../lib/prisma');

const fail = (res, error, label) => {
  console.error(`${label} error:`, error);
  return res.status(500).json({ message: `Unable to ${label}` });
};

const getProducts = async (req, res) => {
  try {
    const { categoryId, vendorId, search } = req.query;
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Number(req.query.limit) || 12, 50);

    const where = {
      vendor: { isApproved: true },
      ...(categoryId ? { categoryId: Number(categoryId) } : {}),
      ...(vendorId ? { vendorId: String(vendorId) } : {}),
      ...(search ? { title: { contains: String(search), mode: 'insensitive' } } : {}),
    };

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: { category: true, brand: true, vendor: { select: { id: true, storeName: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.product.count({ where }),
    ]);

    return res.json({ products, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    return fail(res, error, 'fetch products');
  }
};

const getProductById = async (req, res) => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: { category: true, brand: true, vendor: { select: { id: true, storeName: true } } },
    });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    return res.json({ product });
  } catch (error) {
    return fail(res, error, 'fetch product');
  }
};

const parseProductBody = (body) => {
  const data = {};
  if (body.title !== undefined) data.title = String(body.title).trim();
  if (body.description !== undefined) data.description = body.description ? String(body.description) : null;
  if (body.price !== undefined) data.price = Number(body.price);
  if (body.stock !== undefined) data.stock = Number(body.stock);
  if (body.categoryId !== undefined) data.categoryId = Number(body.categoryId);
  if (body.brandId !== undefined) data.brandId = body.brandId ? Number(body.brandId) : null;
  return data;
};

const invalid = (data, requireAll) => {
  if (requireAll && (!data.title || data.price === undefined || !data.categoryId)) {
    return 'title, price and categoryId are required';
  }
  if (data.price !== undefined && (!Number.isFinite(data.price) || data.price < 0)) return 'Invalid price';
  if (data.stock !== undefined && (!Number.isInteger(data.stock) || data.stock < 0)) return 'Invalid stock';
  return null;
};

// Vendor (approved) creates for own store; admin must pass vendorId.
const createProduct = async (req, res) => {
  try {
    const data = parseProductBody(req.body);
    const problem = invalid(data, true);
    if (problem) return res.status(400).json({ message: problem });

    let vendorId;
    if (req.user.role === 'ADMIN') {
      vendorId = req.body.vendorId;
      if (!vendorId) return res.status(400).json({ message: 'vendorId is required for admin' });
    } else {
      if (!req.user.vendorProfile?.isApproved) {
        return res.status(403).json({ message: 'Your store is awaiting admin approval' });
      }
      vendorId = req.user.vendorProfile.id;
    }

    const product = await prisma.product.create({ data: { ...data, vendorId } });
    return res.status(201).json({ product });
  } catch (error) {
    if (error?.code === 'P2003') return res.status(400).json({ message: 'Invalid category, brand or vendor' });
    return fail(res, error, 'create product');
  }
};

const loadOwnedProduct = async (req, res) => {
  const product = await prisma.product.findUnique({ where: { id: req.params.id } });
  if (!product) {
    res.status(404).json({ message: 'Product not found' });
    return null;
  }
  if (req.user.role === 'VENDOR' && product.vendorId !== req.user.vendorProfile?.id) {
    res.status(403).json({ message: 'You can only manage your own products' });
    return null;
  }
  return product;
};

const updateProduct = async (req, res) => {
  try {
    const product = await loadOwnedProduct(req, res);
    if (!product) return undefined;
    const data = parseProductBody(req.body);
    const problem = invalid(data, false);
    if (problem) return res.status(400).json({ message: problem });
    const updated = await prisma.product.update({ where: { id: product.id }, data });
    return res.json({ product: updated });
  } catch (error) {
    return fail(res, error, 'update product');
  }
};

const deleteProduct = async (req, res) => {
  try {
    const product = await loadOwnedProduct(req, res);
    if (!product) return undefined;
    await prisma.product.delete({ where: { id: product.id } });
    return res.json({ message: 'Product deleted' });
  } catch (error) {
    if (error?.code === 'P2003') {
      return res.status(409).json({ message: 'Product has orders and cannot be deleted' });
    }
    return fail(res, error, 'delete product');
  }
};

module.exports = { getProducts, getProductById, createProduct, updateProduct, deleteProduct };
