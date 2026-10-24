export async function getMongoAiDb() {
  return {
    collection: () => ({
      findOne: async () => null,
      find: () => ({ toArray: async () => [], sort: () => ({ toArray: async () => [] }) }),
      insertOne: async () => ({}),
      updateOne: async () => ({}),
      deleteOne: async () => ({}),
      deleteMany: async () => ({}),
    }),
  };
}
