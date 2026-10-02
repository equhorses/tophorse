const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db, authenticate, wrap } = require('../lib/common');

const sign = (u) => jwt.sign({ id: u.id, role: u.role, email: u.email }, process.env.JWT_SECRET, { expiresIn: '7d' });
const publicUser = ({ password, ...u }) => u;

router.post('/register', wrap(async (req, res) => {
  const { email, password, firstName, lastName, country, phone, city, company } = req.body || {};
  if (!email || !/^\S+@\S+\.\S+$/.test(email) || !password || password.length < 8 || !firstName || !lastName || !country) {
    return res.status(400).json({ error: 'Completa nombre, apellidos, país, un email válido y una contraseña de al menos 8 caracteres' });
  }
  const mail = email.trim().toLowerCase();
  if (await db.one('SELECT id FROM users WHERE email=$1', [mail])) return res.status(409).json({ error: 'Ya existe una cuenta con ese email' });
  const user = await db.one(
    `INSERT INTO users(email, password, first_name, last_name, country, phone, city, company)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [mail, await bcrypt.hash(password, 10), firstName.trim(), lastName.trim(), country.trim(), phone || null, city || null, company ? String(company).trim() : null],
  );
  res.status(201).json({ token: sign(user), user: publicUser(user) });
}));

router.post('/login', wrap(async (req, res) => {
  const { email, password } = req.body || {};
  const user = email && await db.one('SELECT * FROM users WHERE email=$1', [email.trim().toLowerCase()]);
  if (!user || !user.isActive || !(await bcrypt.compare(password || '', user.password))) {
    return res.status(401).json({ error: 'Email o contraseña incorrectos' });
  }
  res.json({ token: sign(user), user: publicUser(user) });
}));

router.get('/me', authenticate, wrap(async (req, res) => {
  const user = await db.one('SELECT * FROM users WHERE id=$1', [req.user.id]);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json(publicUser(user));
}));

module.exports = router;
