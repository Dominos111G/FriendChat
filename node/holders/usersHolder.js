// All maps are keyed by the application connectionId.
export const connectedUsers = new Map();
export const searchingUsers = new Map();

// Stores both directions: connectionId -> partner connectionId.
export const connectedPairs = new Map();