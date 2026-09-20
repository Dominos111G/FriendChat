import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import admin from 'firebase-admin';

import { 
  getUsersCollection, getMessagesCollection, 
  getLoginDetailsCollection, getTokensCollection,
  getReportsCollection
} from './firebaseController.js';

export async function loginUser(req, res) {
  try {
    const username = req.body.username;
    const password = req.body.password;
    const rememberMe = (Boolean(req.body.rememberMe) || false);

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Some required fields are missing.' });
    }

    const usersRef = getUsersCollection();
    const snapshot = await usersRef.where('username', '==', username).get();
    if (snapshot.empty) {
      return res.status(401).json({ success: false, message: 'Invalid username or password.' });
    }

    const userDoc = snapshot.docs[0];
    const userData = userDoc.data();

    // Sprawdzenie czy konto jest aktywowane
    if (!userData.isActive) {
      return res.status(403).json({ success: false, message: 'Account is not verified.' });
    }

    const passwordMatch = await bcrypt.compare(password, userData.passwordHash);
    if (!passwordMatch) {
      return res.status(401).json({ success: false, message: 'Invalid username or password.' });
    }

    req.session.userId = userDoc.id;
    req.session.username = userData.username;

    if (rememberMe) {
      const rememberToken = randomBytes(32).toString('base64url');
      const tokensRef = getTokensCollection();
      await tokensRef.add({
        token: rememberToken,
        userId: userDoc.id,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      });
      res.cookie('userToken', rememberToken, { httpOnly: true, maxAge: 30 * 24 * 60 * 60 * 1000 });
    }

    const loginDetailsRef = getLoginDetailsCollection();
    await loginDetailsRef.add({
      userId: userDoc.id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      rememberMe: rememberMe,
      loginAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await usersRef.doc(userDoc.id).update({ lastLogin: admin.firestore.FieldValue.serverTimestamp() });

    return res.status(200).json({ success: true, message: 'Login successful.' });
  } catch (err) {
    console.error('Error while logging in:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
}

export async function registerUser(req, res) {
  try {
    const username = String(req.body.username || '').trim();
    const email = String(req.body.email || '').trim();
    const password = req.body.password;

    if (!username || !email || !password) {
      return res.status(400).json({ success: false, message: 'Some required fields are missing.' });
    }

    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ success: false, message: 'Username must be between 3 and 20 characters long.' });
    }

    if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) {
      return res.status(400).json({ success: false, message: 'Invalid email format.' });
    }

    if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      return res.status(400).json({ success: false, message: 'Password must meet the required criteria.' });
    }

    const usersRef = getUsersCollection();
    const usernameSnapshot = await usersRef.where(admin.firestore.Filter.or(
      admin.firestore.Filter.where('username', '==', username), 
      admin.firestore.Filter.where('email', '==', email)
    )).get();

    if (!usernameSnapshot.empty) {
      const existingDoc = usernameSnapshot.docs[0].data();
      if (existingDoc.username === username) {
        return res.status(409).json({ success: false, message: 'Username already exists.' });
      } else {
        return res.status(409).json({ success: false, message: 'Email already exists.' });
      }
    }

    const verifyCode = Math.random().toString(36).slice(2, 8).toUpperCase();
    const passwordHash = await bcrypt.hash(password, 10);

    await usersRef.add({ 
      username, 
      email, 
      passwordHash, 
      isActive: false,
      verifyCode, 
      verifyExpiresAt: new Date(Date.now() + 3 * 60 * 60 * 1000),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      permissions: 1,
      lastLogin: null
    });

    return res.status(200).json({ success: true, message: 'Registration successful. Please verify your account.' });
  } catch (err) {
    console.error('Error while registering user:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
}

export async function verifyUser(req, res) {
  try {
    const email = String(req.body.email || '').trim();
    const code = String(req.body.code || '').trim();

    if (!email || !code) {
      return res.status(400).json({ success: false, message: 'Some required fields are missing.' });
    }

    const usersRef = getUsersCollection();
    const snapshot = await usersRef.where('email', '==', email).get();
    if (snapshot.empty) {
      return res.status(401).json({ success: false, message: 'User not found.' });
    }

    const userDoc = snapshot.docs[0];
    const userData = userDoc.data();

    if (userData.isActive) {
      return res.status(400).json({ success: false, message: 'Account is already verified.' });
    }

    if (userData.verifyCode !== code) {
      return res.status(400).json({ success: false, message: 'Invalid verification code.' });
    }

    if (userData.verifyExpiresAt && userData.verifyExpiresAt.toDate() < new Date()) {
      return res.status(400).json({ success: false, message: 'Verification code has expired.' });
    }

    await usersRef.doc(userDoc.id).update({
      isActive: true,
      verifyCode: null,
      verifyExpiresAt: null
    });

    return res.status(200).json({ success: true, message: 'Account verified successfully.' });
  } catch (err) {
    console.error('Error while verifying account:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
}

export async function verifyUserToken(req, res) {
  try {
    const token = String(req.body.token || '').trim();

    if (!token) {
      return res.status(400).json({ success: false, message: 'Token is required.' });
    }

    const tokensRef = getTokensCollection();
    const snapshot = await tokensRef.where('token', '==', token).get();
    if (snapshot.empty) {
      return res.status(401).json({ success: false, message: 'Token is invalid or expired.' });
    }

    const tokenData = snapshot.docs[0].data();
    if (tokenData.expiresAt && tokenData.expiresAt.toDate() < new Date()) {
      return res.status(401).json({ success: false, message: 'Token is invalid or expired.' });
    }

    req.session.userId = tokenData.userId;

    return res.status(200).json({ success: true, message: 'Token is valid.' });
  } catch (err) {
    console.error('Error while verifying token:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
}