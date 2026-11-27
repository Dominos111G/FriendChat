let socket = null;

export function initSocket() {
  if (!socket) {
    const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    const serverUrl = isLocalhost
      ? `http://${window.location.hostname}:3000`
      : undefined;

    socket = io(serverUrl, { withCredentials: true });

    socket.on('connect', () => {
      console.log('Connected to server with socket ID:', socket.id);
    });

    socket.on('connectionId', (connectionId) => {
      socket.connectionId = connectionId;
      console.log('Connected with application connection ID:', connectionId);
    });

    socket.on('connect_error', (error) => {
      console.error('Could not connect to server:', error.message, error.data);
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from server');
    });
  }
  return socket;
}

export function getSocket() {
  if (!socket) {
    throw new Error("Socket does not exist!");
  }
  return socket;
}
