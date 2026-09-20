import { verifyMessage } from '../verification/message.js';

import { connectedUsers, searchingUsers, connectedPairs } from '../holders/usersHolder.js'

const validStatuses = ['idle', 'searching', 'connected'];
const validGenders = ['-', 'male', 'female', 'other'];
const maxAge = 120;

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
    return { valid: false, reason: 'age must be an integer between 18 and 120.' };
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
      userid: session?.userId ?? null,
      nick: nick.value,
      age,
      gender: data.gender,
      country: country.value
    }
  };
}

function validatePreferences(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { valid: false, reason: 'Pref must be an object.' };
  }

  const ageMin = Number(data.ageMin);
  if (!Number.isInteger(ageMin) || ageMin < 13 || ageMin > maxAge) {
    return { valid: false, reason: 'ageMin must be an integer between 13 and 120.' };
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

  const currentStatus = connectedUsers[socketId]?.status;
  if (currentStatus === newStatus) { 
    console.log(`Status for socket ${socketId} is already ${newStatus}`);
    return;
  }

  // Usuń z listy
  if (currentStatus === 'searching') { delete searchingUsers[socketId]; } 
  else if (currentStatus === 'connected') { delete connectedPairs[socketId]; }
  
  // Zmień status
  if (connectedUsers[socketId]) { connectedUsers[socketId].status = newStatus; }
  
  // Dodaj do listy
  if (newStatus === 'searching') { searchingUsers[socketId] = connectedUsers[socketId]; } 
  else if (newStatus === 'connected') { connectedPairs[socketId] = connectedUsers[socketId]; }
}

function tryToPairUsers() {
  for (const [socketIdA, userA] of Object.entries(searchingUsers)) {
    const pref = userA.pref;
    if (!pref) { console.log("Could not find user prefs!"); continue; }
    for (const [socketIdB, userB] of Object.entries(searchingUsers)) {
      if (socketIdA === socketIdB) continue;
      const info = userB.info;
      if (!info) { console.log("Could not find user info!"); continue; }
    }
  }
}

export function registerServerSocket(io){
  console.log('Registering server socket...');
  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);
    connectedUsers[socket.id] = { socket, status: 'idle', info: null, pref: null };
    socket.on('setUserData', (data, callback) => {
      const respond = typeof callback === 'function' ? callback : () => {};
      const user = connectedUsers[socket.id];
      const infoResult = validateInfo(data?.info, socket.request.session);
      if (!infoResult.valid) {
        return respond({ success: false, message: infoResult.reason });
      }

      user.info = infoResult.value;
      user.pref = null;

      if (socket.request.session?.userId) {
        const prefResult = validatePreferences(data?.pref);
        if (!prefResult.valid) {
          user.info = null;
          return respond({ success: false, message: prefResult.reason });
        }
        user.pref = prefResult.value;
      }

      return respond({ success: true, data: { info: user.info, pref: user.pref } });
    });
    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
      delete searchingUsers[socket.id];
      delete connectedPairs[socket.id];
      delete connectedUsers[socket.id];
    });
  });

  return async function socketServerLoop() {
    console.log('Starting socket server loop...');
    const delay = ms => new Promise(res => setTimeout(res, ms));
    let lastKnownLength = 0;
    while (true) {
      const currentLength = Object.keys(connectedUsers).length;
      if (lastKnownLength !== currentLength) { console.log('Connected users:', currentLength); lastKnownLength = currentLength; }
      if (currentLength > 0) {
        tryToPairUsers();
      }
      await delay(1000);
    }
  };
}
