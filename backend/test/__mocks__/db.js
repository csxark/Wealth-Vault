// Mock database for tests
const mockDb = {
  select: jest.fn(() => ({
    from: jest.fn(() => ({
      where: jest.fn(() => ({
        limit: jest.fn(() => Promise.resolve([]))
      }))
    }))
  })),
  insert: jest.fn(() => ({
    values: jest.fn(() => ({
      returning: jest.fn(() => Promise.resolve([]))
    }))
  })),
  update: jest.fn(() => ({
    set: jest.fn(() => ({
      where: jest.fn(() => ({
        returning: jest.fn(() => Promise.resolve([]))
      }))
    }))
  })),
  delete: jest.fn(() => ({
    where: jest.fn(() => Promise.resolve({}))
  }))
};

export default mockDb;