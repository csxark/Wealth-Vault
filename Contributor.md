# Contributor Guidelines for Wealth Vault

## Project Overview

Wealth Vault is a comprehensive financial wellness application built with the MERN stack (MongoDB, Express.js, React, TypeScript) that helps users track spending patterns, set financial goals, and make informed financial decisions using AI-powered insights.

### Tech Stack

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Backend**: Node.js + Express.js
- **Authentication**: JWT + Supabase (hybrid setup)
- **Charts**: Chart.js + React-Chartjs-2
- **Additional**: QR scanning, CSV import, AI coaching

## Expectations for Contributors

### Technical Skills Required

- **Frontend**: React, TypeScript, Tailwind CSS, Vite
- **Backend**: Node.js, Express.js, Drizzle ORM
- **Tools**: Git, npm/yarn, ESLint, Jest (for testing)
- **APIs**: RESTful API design, JWT authentication
- **Optional but helpful**: Supabase, Chart.js, QR code libraries

### Coding Standards

- **TypeScript**: Strict typing required, no `any` types without justification
- **React**: Functional components with hooks, proper state management
- **Code Style**: Follow ESLint configuration, consistent naming (camelCase for variables/functions, PascalCase for components)
- **Commits**: Clear, descriptive commit messages following conventional commits
- **Documentation**: JSDoc for functions, inline comments for complex logic

### Development Workflow

1. Fork the repository
2. Create a feature branch from `main`
3. Make changes with proper tests
4. Ensure all tests pass and linting is clean
5. Submit a pull request with a detailed description
6. Address review feedback

### Testing Requirements

- Unit tests for utilities and hooks
- Integration tests for API endpoints
- Component tests for React components
- E2E tests for critical user flows (future goal)

### Code Review Process

- All PRs require at least one approval
- Reviews focus on code quality, security, and functionality
- Maintainers will provide constructive feedback
- No direct pushes to the main branch

## Areas for Improvement

### Testing and Quality Assurance

The project currently has minimal test coverage despite Jest being configured. Contributors are encouraged to implement comprehensive testing strategies, including:

- Unit tests for backend models, utilities, and business logic
- Integration tests for API endpoints and database operations
- Component tests for React components using React Testing Library
- End-to-end tests for critical user workflows using Playwright or Cypress

### Documentation

While basic setup guides are available, the project lacks comprehensive documentation. Opportunities include:

- OpenAPI/Swagger documentation for all backend API endpoints
- Storybook integration for component documentation and development
- Detailed developer onboarding guides and API reference manuals
- Database schema documentation and migration guides
- Resolution of markdown formatting issues in existing documentation files

### Error Handling and Validation

Current error handling is basic and primarily focused on API responses. Enhancements should include:

- Global error boundaries for React applications to prevent application crashes
- Comprehensive input validation on both frontend forms and backend endpoints
- User-friendly error messages with actionable guidance
- Automatic retry mechanisms for transient network failures
- Structured logging system for debugging and monitoring

### Security

The application implements basic JWT authentication and CORS configuration. Security improvements should encompass:

- Rate limiting to prevent abuse and denial-of-service attacks
- Input sanitization to protect against injection attacks
- Regular security audits of dependencies and third-party libraries
- CSRF protection for state-changing operations
- Password strength requirements and secure password policies
- Security header optimization and HTTPS enforcement

### Performance

The application lacks performance optimizations despite a solid foundation. Performance enhancements include:

- Code splitting and lazy loading for React components and routes
- Bundle size optimization and tree shaking
- API response caching and efficient data fetching strategies
- Database query optimization and indexing improvements
- Image optimization and content delivery network integration

### User Experience

The user interface is functional but could benefit from enhanced user experience patterns:

- Loading states and skeleton screens during data fetching
- Comprehensive form validation with real-time feedback
- Keyboard navigation support for accessibility
- Enhanced mobile responsiveness and touch interactions
- Persistent user preferences, including dark mode settings
- Progressive web app features fora native-like experience

### Feature Development

The core functionality is established, but several features could enhance the application's value:

- Enhanced AI financial coaching with more sophisticated algorithms
- Advanced reporting and analytics with data export capabilities
- Notification system for budget alerts and goal milestones
- Multi-currency support and internationalization
- Offline functionality using service workers
- Social features for goal sharing and community engagement

### Accessibility and Internationalization

The application is currently English-only with basic accessibility support. Improvements include:

- WCAG 2.1 AA compliance for web accessibility standards
- Screen reader compatibility and ARIA implementation
- Comprehensive keyboard navigation throughout the application
- Multi-language support with internationalization (i18n) framework
- Right-to-left language support for applicable locales
- Currency and number formatting localization

### Database and Architecture

The hybrid MongoDB/Supabase architecture provides flexibility, but could be enhanced:

- Database migration system for schema evolution
- Automated backup and disaster recovery procedures
- Database performance monitoring and optimization
- Enhanced schema validation and data integrity checks
- Evaluation of PostgreSQL for complex analytical queries
- Strategic database indexing for improved query performance

## Getting Started for Contributors

1. **Setup Development Environment**:

   ```bash
   npm run sync  # Automated setup
   # OR
   npm run install-all
   npm run setup
   npm run dev
   ```

2. **Run Tests**:

   ```bash
   cd backend && npm test
   cd ../frontend && npm run lint
   ```

3. **Check Code Quality**:
   ```bash
   npm run lint  # Frontend linting
   ```

## Communication

- **Issues**: Use GitHub Issues for bugs and feature requests
- **Discussions**: Use GitHub Discussions for questions and ideas
- **Pull Requests**: Follow the PR template and provide detailed descriptions
- **Code Reviews**: Be constructive and respectful

Thank you for contributing to Wealth Vault! Your efforts help users achieve better financial wellness.</content>
