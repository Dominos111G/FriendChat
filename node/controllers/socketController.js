import { verifyMessage } from '../verification/message.js';

import { connectedUsers, searchingUsers, connectedPairs } from '../holders/usersHolder.js'

const validStatuses = ['Idle', 'Searching', 'Connected'];
const validGenders = ['-', 'Male', 'Female', 'Other'];
const maxAge = 120;
const maxMessageLength = 1000;

function getConnectionId(socket) {
  const userId = socket.request.session?.user?.id;
  return userId ? String(userId) : `socket_${socket.id}`;
}

function getText(value, field, maxLength) {
  if (typeof value !== 'string') {
    return { valid: false, reason: `${field} must be a string.` };
  }

  const text = value.trim();
  if (!text || text.length > maxLength) {
    return { valid: false, reason: `${field} has an invalid length.` };
  }

  return { valid: true, value: text };
}

function validateInfo(data, session) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { valid: false, reason: 'Info must be an object.' };
  }

  const nick = getText(data.nick, 'nick', 20);
  const country = getText(data.country, 'country', 56);
  const age = Number(data.age);
  if (!nick.valid || !country.valid) {
    return { valid: false, reason: nick.valid ? country.reason : nick.reason };
  }
  if (!Number.isInteger(age) || age < 18 || age > maxAge) {
    return { valid: false, reason: `age must be an integer between 18 and ${maxAge}.` };
  }
  if (!validGenders.includes(data.gender)) {
    return { valid: false, reason: 'gender is invalid.' };
  }
  if (!verifyMessage(nick.value).valid) {
    return { valid: false, reason: 'nick contains inappropriate content.' };
  }

  return {
    valid: true,
    value: {
      userid: session?.user?.id ?? null,
      nick: nick.value,
      age,
      gender: data.gender,
      country: country.value
    }
  };
}

function getSessionInfo(session) {
  const sessionUser = session?.user;
  if (!sessionUser) {
    return null;
  }

  const result = validateInfo({
    nick: sessionUser.username,
    age: sessionUser.age,
    gender: validGenders.includes(sessionUser.gender) ? sessionUser.gender : '-',
    country: typeof sessionUser.country === 'string' && sessionUser.country.trim()
      ? sessionUser.country
      : '-'
  }, session);

  if (!result.valid) {
    console.warn(`Could not load chat profile from session: ${result.reason}`);
    return null;
  }

  return result.value;
}

function validatePref(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { valid: false, reason: 'Pref must be an object.' };
  }

  const ageMin = Number(data.ageMin);
  const ageMax = Number(data.ageMax);
  if (!Number.isInteger(ageMin) || !Number.isInteger(ageMax) || ageMin < 18 || ageMin > maxAge-5) {
    return { valid: false, reason: `age must be an integer between 18 and ${maxAge-5}.` };
  }
  if (ageMax < 23 || ageMax > maxAge || (ageMax - ageMin) < 5) {
      return { valid: false, reason: 'age must have at least a 5 years gap between min and max.' };
  }
  if (!validGenders.includes(data.gender)) {
    return { valid: false, reason: 'pref gender is invalid.' };
  }
  if (typeof data.country !== 'string' || data.country.trim().length > 56) {
    return { valid: false, reason: 'pref country is invalid.' };
  }

  return {
    valid: true,
    value: { ageMin, gender: data.gender, country: data.country.trim() || '-' }
  };
}

export function changeUserStatus(socketId, newStatus) {
  if (!validStatuses.includes(newStatus)) {
    console.error(`Invalid status: ${newStatus}`);
    return;
  }

  const user = connectedUsers.get(socketId);
  if (!user) {
    console.error(`Cannot change status: user ${socketId} is not connected.`);
    return;
  }

  const currentStatus = user.status;
  if (currentStatus === newStatus) { 
    console.log(`Status for socket ${socketId} is already ${newStatus}`);
    return;
  }

  searchingUsers.delete(socketId);

  if (currentStatus === 'Connected' && newStatus !== 'Connected') {
    const partnerId = connectedPairs.get(socketId);
    connectedPairs.delete(socketId);
    if (partnerId !== undefined) {
      connectedPairs.delete(partnerId);
      const partner = connectedUsers.get(partnerId);
      if (partner) {
        partner.status = 'Idle';
      }
    }
  }

  user.status = newStatus;
  if (newStatus === 'Searching') {
    searchingUsers.set(socketId, user);
  }
}

function tryToPairUsers() {
  for (const [socketIdA, userA] of searchingUsers) {
    for (const [socketIdB, userB] of searchingUsers) {
      if (socketIdA === socketIdB) continue;
      // ADD LATER: Check if userB matches userA's preferences

      // Connect users
      connectedPairs.set(socketIdA, socketIdB);
      connectedPairs.set(socketIdB, socketIdA);
      changeUserStatus(socketIdA, 'Connected');
      changeUserStatus(socketIdB, 'Connected');
      userA.socket.emit('paired', { partner: userB.info });
      userB.socket.emit('paired', { partner: userA.info });
      console.log(`Paired users: ${socketIdA} and ${socketIdB}`);
      break; // Exit inner loop after pairing
    }
  }
}

function leaveChat(connectionId) {
  const partnerId = connectedPairs.get(connectionId);
  changeUserStatus(connectionId, 'Idle');

  if (partnerId !== undefined) {
    const partner = connectedUsers.get(partnerId);
    if (partner) {
      partner.socket.emit('left');
    }
  }
}

export function registerServerSocket(io){
  console.log('Registering server socket...');

  io.use((socket, next) => {
    const connectionId = getConnectionId(socket);
    if (connectedUsers.has(connectionId)) {
      const error = new Error('This user is already connected.');
      error.data = { code: 'USER_ALREADY_CONNECTED', connectionId };
      return next(error);
    }

    socket.data.connectionId = connectionId;
    next();
  });

  io.on('connection', (socket) => {
    const connectionId = socket.data.connectionId;
    if (connectedUsers.has(connectionId)) {
      socket.disconnect(true);
      return;
    }

    console.log(`Socket connected: ${connectionId} (transport socket: ${socket.id})`);
    connectedUsers.set(connectionId, {
      socket,
      status: 'Idle',
      info: getSessionInfo(socket.request.session),
      pref: null
    });
    socket.emit('connectionId', connectionId);

    socket.on('setUserData', (data, callback) => {
      const respond = typeof callback === 'function' ? callback : () => {};
      const user = connectedUsers.get(connectionId);
      if (!user) {
        return respond({ success: false, message: 'User is no longer connected.' });
      }
      const isAuthenticated = Boolean(socket.request.session?.user?.id);
      if (isAuthenticated) {
        user.info = getSessionInfo(socket.request.session);
      } else if (data?.info !== undefined) {
        const infoResult = validateInfo(data.info, socket.request.session);
        if (!infoResult.valid) {
          return respond({ success: false, message: infoResult.reason });
        }
        user.info = infoResult.value;
      }
      user.pref = null;

      if (isAuthenticated && data?.pref !== undefined && data.pref !== null) {
        const prefResult = validatePref(data?.pref);
        if (!prefResult.valid) {
          console.log(`Invalid preferences for user ${connectionId}: ${prefResult.reason}`);
          return respond({ success: false, message: prefResult.reason });
        }
        user.pref = prefResult.value;
      }

      return respond({ success: true, data: { info: user.info, pref: user.pref } });
    });

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${connectionId}`);
      const user = connectedUsers.get(connectionId);
      if (user?.socket !== socket) return;
      leaveChat(connectionId);
      connectedUsers.delete(connectionId);
    });

    socket.on('start', () => {
      const newStatus = connectedUsers.get(connectionId)?.status === 'Searching' ? 'Idle' : 'Searching';
      changeUserStatus(connectionId, newStatus);
      console.log(`Użytkownik ${connectionId} zmienił status na: ${newStatus}`);
    });
    socket.on('message', (data, callback) => {
      const respond = typeof callback === 'function' ? callback : () => {};
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return respond({ success: false, message: 'Invalid message data.' });
      }

      if (typeof data.message !== 'string' || data.message.length > maxMessageLength) {
        return respond({ success: false, message: `Message must be a string up to ${maxMessageLength} characters.` });
      }

      const verification = verifyMessage(data.message);
      if (!verification.valid) {
        return respond({ success: false, message: verification.reason });
      }

      const partnerId = connectedPairs.get(connectionId);
      const partner = partnerId !== undefined ? connectedUsers.get(partnerId) : null;
      const user = connectedUsers.get(connectionId);
      if (!partner || !user || user.status !== 'Connected' || partner.status !== 'Connected') {
        return respond({ success: false, message: 'You are not connected to a chat partner.' });
      }

      const message = verification.message;
      partner.socket.emit('message', {
        sender: user.info?.nick || 'partner',
        message
      });

      // zaimplementować czyszczenie
      console.log(`Wiadomość wysłana przez ${connectionId}`);
      return respond({ success: true, message });
    });
    socket.on('leave', () => {
      leaveChat(connectionId);
      console.log(`Użytkownik ${connectionId} opuścił pokój`);
    });
  });

  return async function socketServerLoop() {
    console.log('Starting socket server loop...');
    const delay = ms => new Promise(res => setTimeout(res, ms));
    let lastKnownLength = 0;
    while (true) {
      const currentLength = connectedUsers.size;
      if (lastKnownLength !== currentLength) { console.log('Connected users:', currentLength); lastKnownLength = currentLength; }
      if (currentLength > 0) {
        tryToPairUsers();
      }
      await delay(1000);
    }
  };
}
