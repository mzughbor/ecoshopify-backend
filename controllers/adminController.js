const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');

const fail = (res, error, label) => {
  console.error(`${label} error:`, error);
  return res.status(500).json({ message: `Unable to ${label}` });
};

const ROLES = ['CUSTOMER', 'VENDOR', 'ADMIN'];

const getUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ users });
  } catch (error) {
    return fail(res, error, 'fetch users');
  }
};

// Only way to create another admin through the API: an existing admin does it.
const createAdmin = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password || String(password).length < 8) {
      return res.status(400).json({ message: 'Name, email and a password of 8+ characters are required' });
    }
    const user = await prisma.user.create({
      data: {
        name: String(name).trim(),
        email: String(email).trim().toLowerCase(),
        password: await bcrypt.hash(String(password), 10),
        role: 'ADMIN',
      },
      select: { id: true, name: true, email: true, role: true },
    });
    return res.status(201).json({ user });
  } catch (error) {
    if (error?.code === 'P2002') return res.status(400).json({ message: 'Email already in use' });
    return fail(res, error, 'create admin');
  }
};

const updateUserRole = async (req, res) => {
  try {
    const role = String(req.body.role || '').toUpperCase();
    if (!ROLES.includes(role)) return res.status(400).json({ message: 'Invalid role' });
    if (req.params.id === req.user.id) {
      return res.status(400).json({ message: 'You cannot change your own role' });
    }
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { role },
      select: { id: true, name: true, email: true, role: true },
    });
    return res.json({ user });
  } catch (error) {
    if (error?.code === 'P2025') return res.status(404).json({ message: 'User not found' });
    return fail(res, error, 'update role');
  }
};

module.exports = { getUsers, createAdmin, updateUserRole };
