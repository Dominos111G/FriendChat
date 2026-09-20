let socket = null;

export function initSocket() {
  if (!socket) {
    socket = io('http://localhost:3000', { withCredentials: true }); 

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
