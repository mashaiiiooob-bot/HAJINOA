export const pool = {
  query: async () => ({ rows: [] }),
  connect: async () => ({
    query: async () => {},
    release: () => {},
  }),
  end: async () => {},
};

export function query() {
  return Promise.resolve({ rows: [] });
}

export async function withTransaction(callback) {
  return callback({
    query: async () => {},
  });
}
