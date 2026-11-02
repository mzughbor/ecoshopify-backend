const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

const normalizeRole = (role) => {
  const value = String(role || 'CUSTOMER').trim().toUpperCase();
  return ['CUSTOMER', 'VENDOR', 'ADMIN'].includes(value) ? value : 'CUSTOMER';
};

const sanitizeUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
  vendorProfile: user.vendorProfile || null,
});

const signToken = (user) => {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: '7d' },
  );
};

const registerUser = async (req, res) => {
  try {
    const { name, email, password, role, storeName, description } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email and password are required' });
    }

    if (String(password).length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedRole = normalizeRole(role);

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const userPayload = {
      name: String(name).trim(),
      email: normalizedEmail,
      password: hashedPassword,
      role: normalizedRole,
    };

    const user = await prisma.user.create({
      data:
        normalizedRole === 'VENDOR'
          ? {
              ...userPayload,
              vendorProfile: {
                create: {
                  storeName: storeName ? String(storeName).trim() : `${String(name).trim()}'s Store`,
                  description: description ? String(description).trim() : null,
                },
              },
            }
          : userPayload,
      include: {
        vendorProfile: true,
      },
    });

    const token = signToken(user);

    return res.status(201).json({
      message: 'User registered successfully',
      token,
      user: sanitizeUser(user),
    });
  } catch (error) {
    console.error('Register error:', error);

    if (error?.code === 'P2002') {
      return res.status(400).json({ message: 'A user with this email or store name already exists.' });
    }

    return res.status(500).json({ message: 'Unable to register user', error: error.message });
  }
};

const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: { vendorProfile: true },
    });

    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const isPasswordValid = await bcrypt.compare(String(password), user.password);

    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const token = signToken(user);

    return res.status(200).json({
      message: 'Login successful',
      token,
      user: sanitizeUser(user),
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ message: 'Unable to log in', error: error.message });
  }
};

const getProfile = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { vendorProfile: true },
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.status(200).json({ user: sanitizeUser(user) });
  } catch (error) {
    console.error('Profile fetch error:', error);
    return res.status(500).json({ message: 'Unable to fetch profile', error: error.message });
  }
};

const logoutUser = async (req, res) => {
  return res.status(200).json({ message: 'Logged out successfully' });
};

module.exports = {
  registerUser,
  loginUser,
  getProfile,
  logoutUser,
};
