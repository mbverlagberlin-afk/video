// Benutzerkonten und Anmeldung: Passwörter mit scrypt, Sitzungen per HttpOnly-Cookie.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_DIR } from './config.js';

const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const COOKIE = 'kfs_session';
const SESSION_DAYS = 30;

const read = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const write = (f, v) => { fs.writeFileSync(f + '.tmp', JSON.stringify(v, null, 2)); fs.renameSync(f + '.tmp', f); };

const hashPassword = (pw, salt = crypto.randomBytes(16).toString('hex')) => ({ salt, hash: crypto.scryptSync(pw, salt, 64).toString('hex') });
function checkPassword(user, pw) {
  const h = Buffer.from(crypto.scryptSync(pw, user.salt, 64).toString('hex'));
  const ref = Buffer.from(user.hash);
  return h.length === ref.length && crypto.timingSafeEqual(h, ref);
}

export function verifyPassword(userId, pw) {
  const u = listUsers().find((x) => x.id === userId);
  return !!u && checkPassword(u, pw);
}

export const listUsers = () => read(USERS_FILE, []);
const publicUser = (u) => u && ({ id: u.id, email: u.email, name: u.name, role: u.role, createdAt: u.createdAt });
export const hasUsers = () => listUsers().length > 0;

function validate(email, password) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '')) throw new Error('Bitte eine gültige E-Mail-Adresse angeben.');
  if (!password || password.length < 8) throw new Error('Das Passwort muss mindestens 8 Zeichen lang sein.');
}

export function createUser({ email, password, name, role = 'user' }) {
  validate(email, password);
  const users = listUsers();
  email = email.trim().toLowerCase();
  if (users.some((u) => u.email === email)) throw new Error('Diese E-Mail-Adresse ist bereits registriert.');
  const user = { id: crypto.randomUUID(), email, name: (name || email.split('@')[0]).trim(), role: role === 'admin' ? 'admin' : 'user', ...hashPassword(password), createdAt: new Date().toISOString() };
  users.push(user); write(USERS_FILE, users);
  return publicUser(user);
}

export function setPassword(userId, password) {
  validate('a@b.cd', password);
  const users = listUsers(); const u = users.find((x) => x.id === userId);
  if (!u) throw new Error('Benutzer nicht gefunden');
  Object.assign(u, hashPassword(password)); write(USERS_FILE, users);
  // alle bestehenden Sitzungen dieses Benutzers beenden
  write(SESSIONS_FILE, Object.fromEntries(Object.entries(read(SESSIONS_FILE, {})).filter(([, s]) => s.userId !== userId)));
}

export function deleteUser(userId) {
  const users = listUsers();
  const u = users.find((x) => x.id === userId);
  if (!u) throw new Error('Benutzer nicht gefunden');
  if (u.role === 'admin' && users.filter((x) => x.role === 'admin').length === 1) throw new Error('Der letzte Administrator kann nicht gelöscht werden.');
  write(USERS_FILE, users.filter((x) => x.id !== userId));
  write(SESSIONS_FILE, Object.fromEntries(Object.entries(read(SESSIONS_FILE, {})).filter(([, s]) => s.userId !== userId)));
}

/** Legt beim Start ein Admin-Konto aus ADMIN_EMAIL/ADMIN_PASSWORD an, falls noch niemand existiert. */
export function seedAdminFromEnv() {
  if (!hasUsers() && process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    createUser({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD, name: 'Administrator', role: 'admin' });
    console.log('Admin-Konto angelegt:', process.env.ADMIN_EMAIL);
  }
}

// ---------- Anmeldeversuche begrenzen (Schutz gegen Passwort-Raten) ----------
const attempts = new Map();
function rateLimit(key) {
  const now = Date.now(); const a = (attempts.get(key) || []).filter((t) => now - t < 15 * 60 * 1000);
  if (a.length >= 10) throw new Error('Zu viele Anmeldeversuche. Bitte in 15 Minuten erneut versuchen.');
  a.push(now); attempts.set(key, a);
}

function cookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((x) => x[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
}

function setCookie(req, res, value, maxAgeSec) {
  const secure = req.secure ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`);
}

export function login(req, res, email, password) {
  rateLimit(req.ip);
  const u = listUsers().find((x) => x.email === String(email || '').trim().toLowerCase());
  if (!u || !checkPassword(u, String(password || ''))) throw new Error('E-Mail oder Passwort ist falsch.');
  const token = crypto.randomBytes(32).toString('hex');
  const sessions = read(SESSIONS_FILE, {});
  const now = Date.now();
  for (const [k, s] of Object.entries(sessions)) if (s.expires < now) delete sessions[k];
  sessions[crypto.createHash('sha256').update(token).digest('hex')] = { userId: u.id, expires: now + SESSION_DAYS * 864e5 };
  write(SESSIONS_FILE, sessions);
  setCookie(req, res, token, SESSION_DAYS * 86400);
  return publicUser(u);
}

export function logout(req, res) {
  const token = cookies(req)[COOKIE];
  if (token) { const s = read(SESSIONS_FILE, {}); delete s[crypto.createHash('sha256').update(token).digest('hex')]; write(SESSIONS_FILE, s); }
  setCookie(req, res, '', 0);
}

export function currentUser(req) {
  const token = cookies(req)[COOKIE];
  if (!token) return null;
  const s = read(SESSIONS_FILE, {})[crypto.createHash('sha256').update(token).digest('hex')];
  if (!s || s.expires < Date.now()) return null;
  return publicUser(listUsers().find((u) => u.id === s.userId));
}

export function requireUser(req, res, next) {
  const u = currentUser(req);
  if (!u) return res.status(401).json({ error: 'Bitte anmelden.' });
  req.user = u; next();
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Nur für Administratoren.' });
  next();
}
