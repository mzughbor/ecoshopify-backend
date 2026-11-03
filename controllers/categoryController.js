const prisma = require('../lib/prisma');

const fail = (res, error, label) => {
  console.error(`${label} error:`, error);
  return res.status(500).json({ message: `Unable to ${label}` });
};

const getCategories = async (req, res) => {
  try {
    const categories = await prisma.category.findMany({ orderBy: { name: 'asc' } });
    return res.json({ categories });
  } catch (error) {
    return fail(res, error, 'fetch categories');
  }
};

const getCategoryTree = async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      where: { parentId: null },
      include: { children: true },
      orderBy: { name: 'asc' },
    });
    return res.json({ categories });
  } catch (error) {
    return fail(res, error, 'fetch category tree');
  }
};

const createCategory = async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ message: 'Category name is required' });
    const parentId = req.body.parentId ? Number(req.body.parentId) : null;
    const category = await prisma.category.create({ data: { name, parentId } });
    return res.status(201).json({ category });
  } catch (error) {
    return fail(res, error, 'create category');
  }
};

module.exports = { getCategories, getCategoryTree, createCategory };
