# Testing Quick Start Guide

## 🚀 Getting Started with Tests

### First Time Setup

```bash
# Install backend dependencies (if not already done)
cd backend
npm install
```

### Run Your First Tests

```bash
# Run all tests from root
npm test

# Or run from backend directory
cd backend && npm test
```

---

## 📝 Test Commands Cheat Sheet

### Backend (Jest)

```bash
cd backend

npm test                    # Run all backend tests
npm test -- --watch        # Watch mode for development
npm test -- --coverage     # Run with coverage report
npm test -- auth.test.js   # Run specific test file
npm run test:coverage     # Run with coverage
```

---

## ✅ What's Been Added

### Backend Testing

- ✅ Jest configuration with ES modules support
- ✅ Auth route tests (4 tests)
- ✅ Expense route tests (4 tests)
- ✅ Authentication middleware tests (4 tests)
- ✅ Password validator tests (3 tests)
- ✅ Total: 15 tests, all passing

### CI/CD

- ✅ GitHub Actions workflow
- ✅ Automated testing on push/PR
- ✅ Coverage reporting
- ✅ Multi-version Node.js testing (18.x, 20.x)

---

## 📊 Test Coverage

View coverage reports after running tests with coverage:

```bash
# Backend coverage
cd backend && npm test -- --coverage

# Open coverage report (Windows)
start backend/coverage/lcov-report/index.html
```

---

## 🎯 Next Steps

1. **Run the tests** to ensure everything is working
2. **Review the test files** to understand patterns
3. **Add more tests** for your specific features
4. **Check coverage** and aim for 70%+ on critical code

---

## 📚 Learn More

- See [TESTING.md](./TESTING.md) for complete documentation
- Check example tests in `backend/__tests__` directory

---

## 🐛 Troubleshooting

**Tests failing?**

- Ensure backend dependencies are installed: `cd backend && npm install`
- Check that you're using Node.js 18.x or higher
- Run with verbose output: `npm test -- --verbose`

**Need help?**

- Check [TESTING.md](./TESTING.md) for detailed guides
- Review GitHub Actions logs for CI failures
- See test output for specific error messages

---

**Happy Testing! 🧪**
