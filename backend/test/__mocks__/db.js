// Mock database for tests
const mockDb = {
  select: jest.fn(() => ({
    from: jest.fn(() => ({
      where: jest.fn(() => Promise.resolve([])),
      limit: jest.fn(() => Promise.resolve([])),
    })),
  })),
  insert: jest.fn(() => ({
    values: jest.fn(() => ({
      returning: jest.fn(() => Promise.resolve([{ id: 1, email: 'test@example.com' }]))
    }))
  })),
  update: jest.fn(() => ({
    set: jest.fn(() => ({
      where: jest.fn(() => ({
        returning: jest.fn(() => Promise.resolve([]))
      })),
      returning: jest.fn(() => Promise.resolve([]))
    }))
  })),
  delete: jest.fn(() => ({
    where: jest.fn(() => Promise.resolve({}))
  })),
  query: {
    users: {
      findFirst: jest.fn(() => Promise.resolve({ id: 1, email: 'test@example.com', categories: [] })),
      findMany: jest.fn(() => Promise.resolve([])),
    },
    categories: {
      findMany: jest.fn(() => Promise.resolve([])),
    },
    deviceSessions: {
      findFirst: jest.fn(() => Promise.resolve(null)),
    }
  }
};

export default mockDb;