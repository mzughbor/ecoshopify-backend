const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { authResponse, sanitizeUser } = require('../lib/auth');

const MIN_PASSWORD = 8;

const validateBasics = ({ name, email, password }) => {
  if (!name || !email || !password) return 'Name, email and password are required';
  if (String(password).length < MIN_PASSWORD) {
    return `Password must be at least ${MIN_PASSWORD} characters long`;
  }
  return null;
};

const handleError = (res, error, label) => {
  console.error(`${label} error:`, error);
  if (error?.code === 'P2002') {
    return res.status(400).json({ message: 'A user with this email or store name already exists.' });
  }
  return res.status(500).json({ message: `Unable to ${label}` });
};

// POST /api/auth/register  -> always a CUSTOMER. A role sent by the client is ignored.
const registerUser = async (req, res) => {
  try {
    const problem = validateBasics(req.body);
    if (problem) return res.status(400).json({ message: problem });

    const email = String(req.body.email).trim().toLowerCase();
    if (await prisma.user.findUnique({ where: { email } })) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    const user = await prisma.user.create({
      data: {
        name: String(req.body.name).trim(),
        email,
        password: await bcrypt.hash(String(req.body.password), 10),
        role: 'CUSTOMER',
      },
      include: { vendorProfile: true },
    });

    return res.status(201).json(authResponse('User registered successfully', user));
  } catch (error) {
    return handleError(res, error, 'register user');
  }
};

// POST /api/auth/vendor/register -> creates a VENDOR account + pending store (admin approves later).
const registerVendor = async (req, res) => {
  try {
    const problem = validateBasics(req.body);
    if (problem) return res.status(400).json({ message: problem });
    if (!req.body.storeName || !String(req.body.storeName).trim()) {
      return res.status(400).json({ message: 'Store name is required' });
    }

    const email = String(req.body.email).trim().toLowerCase();
    if (await prisma.user.findUnique({ where: { email } })) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    const user = await prisma.user.create({
      data: {
        name: String(req.body.name).trim(),
        email,
        password: await bcrypt.hash(String(req.body.password), 10),
        role: 'VENDOR',
        vendorProfile: {
          create: {
            storeName: String(req.body.storeName).trim(),
            description: req.body.description ? String(req.body.description).trim() : null,
            isApproved: false,
          },
        },
      },
      include: { vendorProfile: true },
    });

    return res
      .status(201)
      .json(authResponse('Vendor registered. Your store is awaiting admin approval.', user));
  } catch (error) {
    return handleError(res, error, 'register vendor');
  }
};

const login = (allowedRoles) => async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await prisma.user.findUnique({
      where: { email: String(email).trim().toLowerCase() },
      include: { vendorProfile: true },
    });

    const valid = user && (await bcrypt.compare(String(password), user.password));
    if (!valid) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    if (allowedRoles && !allowedRoles.includes(user.role)) {
      return res.status(403).json({ message: 'This account cannot sign in here' });
    }

    return res.status(200).json(authResponse('Login successful', user));
  } catch (error) {
    return handleError(res, error, 'log in');
  }
};

// Shared login for every role (response carries role + redirectTo) and a stricter admin-only entry.
const loginUser = login(null);
const loginAdmin = login(['ADMIN']);

const getProfile = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { vendorProfile: true },
    });
    if (!user) return res.status(404).json({ message: 'User not found' });
    return res.status(200).json({ user: sanitizeUser(user) });
  } catch (error) {
    return handleError(res, error, 'fetch profile');
  }
};

const logoutUser = async (req, res) => res.status(200).json({ message: 'Logged out successfully' });

module.exports = { registerUser, registerVendor, loginUser, loginAdmin, getProfile, logoutUser };
