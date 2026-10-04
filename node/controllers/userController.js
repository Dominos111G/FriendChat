import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import util from 'node:util';

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

    if (!userData.isActive) {
      return res.status(403).json({ success: false, message: 'Account is not verified.' });
    }

    const passwordMatch = await bcrypt.compare(password, userData.passwordHash);
    if (!passwordMatch) {
      return res.status(401).json({ success: false, message: 'Invalid username or password.' });
    }

    const asyncOperations = [];

    if (rememberMe) {
      const rememberToken = randomBytes(32).toString('base64url');
      const tokensRef = getTokensCollection();
      
      asyncOperations.push(
        tokensRef.add({
          token: rememberToken,
          userId: userDoc.id,
          createdAt: FieldValue.serverTimestamp(),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        })
      );
      
      res.cookie('userToken', rememberToken, { httpOnly: true, maxAge: 30 * 24 * 60 * 60 * 1000 });
    }

    const loginDetailsRef = getLoginDetailsCollection();
    
    asyncOperations.push(
      loginDetailsRef.add({
        userId: userDoc.id,
        ip: req.ip,
        userAgent: req.get('user-agent'),
        rememberMe: rememberMe,
        loginAt: FieldValue.serverTimestamp()
      }),
      usersRef.doc(userDoc.id).update({ lastLogin: FieldValue.serverTimestamp() })
    );

    await Promise.all(asyncOperations);

    req.session.user = { 
      id: userDoc.id, 
      username: userData.username, 
      permissions: userData.permissions 
    };

    const saveSession = util.promisify(req.session.save.bind(req.session));
    await saveSession();

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
    const birthdayStr = String(req.body.birthday);

    if (!username || !email || !password || !birthdayStr) {
      return res.status(400).json({ success: false, message: 'Some required fields are missing.' });
    }

    const birthday = new Date(birthdayStr);
    if (isNaN(birthday.getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid birthday format.' });
    }
    const today = new Date();
    let age = today.getFullYear() - birthday.getFullYear();
    const monthDifference = today.getMonth() - birthday.getMonth();
    if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < birthday.getDate())) {
      age--;
    }
    if (age < 18) {
      return res.status(400).json({ success: false, message: 'You must be at least 18 years old.' });
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
    const [usernameSnapshot, emailSnapshot] = await Promise.all([
      usersRef.where('username', '==', username).get(),
      usersRef.where('email', '==', email).get()
    ]);

    if (!usernameSnapshot.empty) {
      return res.status(409).json({ success: false, message: 'Username already exists.' });
    }
    if (!emailSnapshot.empty) {
      return res.status(409).json({ success: false, message: 'Email already exists.' });
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
      birthday: birthdayStr,
      createdAt: FieldValue.serverTimestamp(),
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

    const tokenDoc = snapshot.docs[0];
    const tokenData = tokenDoc.data();
    if (tokenData.expiresAt && tokenData.expiresAt.toDate() < new Date()) {
      return res.status(401).json({ success: false, message: 'Token is invalid or expired.' });
    }

    const usersRef = getUsersCollection();
    const userDoc = await usersRef.doc(tokenData.userId).get();
    
    if (!userDoc.exists) {
      return res.status(401).json({ success: false, message: 'User associated with token not found.' });
    }
    
    const userData = userDoc.data();

    req.session.user = { 
      id: userDoc.id, 
      username: userData.username, 
      permissions: userData.permissions 
    };

    const saveSession = util.promisify(req.session.save.bind(req.session));
    await saveSession();

    return res.status(200).json({ success: true, message: 'Token is valid.' });
  } catch (err) {
    console.error('Error while verifying token:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
}

export async function updateMain(req, res) {
  try {
    const userId = req.session?.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User is not authenticated.' });
    }
    const body = req.body || {};
    const action = typeof body.action === 'string' ? body.action.trim() : '';
    if (!action) {
      return res.status(400).json({ success: false, message: 'Action is required.' });
    }

    const usersRef = getUsersCollection();
    const userRef = usersRef.doc(userId);
    const userSnapshot = await userRef.get();
    if (!userSnapshot.exists) {
      return res.status(401).json({ success: false, message: 'Couldn\'t find user.' });
    }

    if (action === 'updateUsername') {
      const newUsername = typeof body.username === 'string' ? body.username.trim() : '';
      if (!newUsername) {
        return res.status(400).json({ success: false, message: 'Username is required.' });
      }

      if (newUsername.length < 3 || newUsername.length > 20) {
        return res.status(400).json({ success: false, message: 'Username must be between 3 and 20 characters long.' });
      }
      const snapshot = await usersRef.where('username', '==', newUsername).get();
      if (snapshot.docs.some((doc) => doc.id !== userId)) {
        return res.status(409).json({ success: false, message: 'Username already exists.' });
      }
      await userRef.update({ username: newUsername });
      req.session.user.username = newUsername;
      const saveSession = util.promisify(req.session.save.bind(req.session));
      await saveSession();
      return res.status(200).json({ success: true, message: 'Username updated successfully.' });
    } else if (action === 'updateEmail') {
      const newEmail = typeof body.email === 'string' ? body.email.trim() : '';
      if (!newEmail) {
        return res.status(400).json({ success: false, message: 'Email is required.' });
      }
      if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(newEmail)) {
        return res.status(400).json({ success: false, message: 'Invalid email format.' });
      }
      const snapshot = await usersRef.where('email', '==', newEmail).get();
      if (snapshot.docs.some((doc) => doc.id !== userId)) {
        return res.status(409).json({ success: false, message: 'Email already exists.' });
      }
      await userRef.update({ email: newEmail });
      req.session.user.email = newEmail;
      const saveSession = util.promisify(req.session.save.bind(req.session));
      await saveSession();
      return res.status(200).json({ success: true, message: 'Email updated successfully.' });
    } else if (action === 'updatePassword') {
      const oldPassword = body.oldPassword;
      const newPassword = body.newPassword;

      if (typeof newPassword !== 'string' || !newPassword ||
          typeof oldPassword !== 'string' || !oldPassword) {
        return res.status(400).json({ success: false, message: 'Both old and new passwords are required.' });
      }
      if (newPassword === oldPassword) {
        return res.status(400).json({ success: false, message: 'New password must be different from the old password.' });
      }
      if (newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
        return res.status(400).json({ success: false, message: 'Password must meet the required criteria.' });
      }

      const passwordMatch = await bcrypt.compare(oldPassword, userSnapshot.data().passwordHash);
      if (!passwordMatch) {
        return res.status(401).json({ success: false, message: 'Old password is incorrect.' });
      }

      const passwordHash = await bcrypt.hash(newPassword, 10);
      await userRef.update({ passwordHash });
      return res.status(200).json({ success: true, message: 'Password updated successfully.' });
    } else {
      return res.status(400).json({ success: false, message: 'Invalid action.' });
    }
  } catch (err) {
    console.error('Error while updating main user info:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
}

export async function updateAbout(req, res) {
  try {
    const userId = req.session?.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User is not authenticated.' });
    }

    const body = req.body || {};
    const updates = {};
    const sessionUpdates = {};

    if (body.birthday !== undefined) {
      if (typeof body.birthday !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.birthday)) {
        return res.status(400).json({ success: false, message: 'Invalid birthday format.' });
      }

      const [year, month, day] = body.birthday.split('-').map(Number);
      const birthday = new Date(Date.UTC(year, month - 1, day));
      if (birthday.getUTCFullYear() !== year ||
          birthday.getUTCMonth() !== month - 1 ||
          birthday.getUTCDate() !== day) {
        return res.status(400).json({ success: false, message: 'Invalid birthday format.' });
      }

      const today = new Date();
      let age = today.getUTCFullYear() - year;
      if (today.getUTCMonth() < month - 1 ||
          (today.getUTCMonth() === month - 1 && today.getUTCDate() < day)) {
        age--;
      }
      if (age < 18 || age > 120) {
        return res.status(400).json({ success: false, message: 'Age must be between 18 and 120.' });
      }

      updates.birthday = body.birthday;
      sessionUpdates.birthday = body.birthday;
      sessionUpdates.age = age;
    }

    if (body.gender !== undefined) {
      if (!['-', 'Male', 'Female', 'Other'].includes(body.gender)) {
        return res.status(400).json({ success: false, message: 'Invalid gender.' });
      }
      updates.gender = body.gender;
      sessionUpdates.gender = body.gender;
    }

    if (body.country !== undefined) {
      if (typeof body.country !== 'string') {
        return res.status(400).json({ success: false, message: 'Country must be a string.' });
      }
      const country = body.country.trim();
      if (!country || country.length > 56) {
        return res.status(400).json({ success: false, message: 'Country must be between 1 and 56 characters long.' });
      }
      updates.country = country;
      sessionUpdates.country = country;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: 'At least one profile field is required.' });
    }

    const userRef = getUsersCollection().doc(userId);
    const userSnapshot = await userRef.get();
    if (!userSnapshot.exists) {
      return res.status(401).json({ success: false, message: 'Couldn\'t find user.' });
    }

    await userRef.update(updates);
    Object.assign(req.session.user, sessionUpdates);
    const saveSession = util.promisify(req.session.save.bind(req.session));
    await saveSession();

    return res.status(200).json({ success: true, message: 'Profile updated successfully.' });
  } catch (err) {
    console.error('Error while updating about user info:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
}
