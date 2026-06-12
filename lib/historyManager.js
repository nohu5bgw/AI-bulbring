const { randomUUID } = require('crypto');

// In-memory store — survives server lifetime, cleared on restart
// { id -> { id, timestamp, tool, toolLabel, filename, description, size, buffer } }
const store = new Map();
const MAX_ENTRIES = 100;

function save(tool, toolLabel, filename, description, buffer) {
  const id = randomUUID();
  store.set(id, {
    id,
    timestamp: new Date().toISOString(),
    tool,
    toolLabel,
    filename,
    description,
    size: buffer.length,
    buffer,
  });
  if (store.size > MAX_ENTRIES) {
    store.delete(store.keys().next().value);
  }
  return id;
}

function list() {
  return [...store.values()]
    .map(({ buffer, ...meta }) => meta)
    .reverse();
}

function get(id) {
  return store.get(id) || null;
}

module.exports = { save, list, get };
