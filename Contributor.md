# Contributor Guidelines for Wealth Vault

## Project Overview

Wealth Vault is a comprehensive financial wellness application built with modern web technologies that helps users track spending patterns, set financial goals, and make informed financial decisions using AI-powered insights.

### Tech Stack

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Backend**: Node.js + Express.js
- **Database**: PostgreSQL + Drizzle ORM
- **Authentication**: JWT-based authentication
- **Charts**: Chart.js + React-Chartjs-2
- **Additional**: QR scanning, CSV import, AI coaching, Redis caching

## Expectations for Contributors

### Technical Skills Required

- **Frontend**: React, TypeScript, Tailwind CSS, Vite
- **Backend**: Node.js, Express.js, Drizzle ORM
- **Tools**: Git, npm/yarn, ESLint, Jest (for testing)
- **APIs**: RESTful API design, JWT authentication
- **Optional but helpful**: PostgreSQL, Redis, Chart.js, QR code libraries

### Coding Standards

- **TypeScript**: Strict typing required, no `any` types without justification
- **React**: Functional components with hooks, proper state management
- **Code Style**: Follow ESLint configuration, consistent naming (camelCase for variables/functions, PascalCase for components)
- **Commits**: Clear, descriptive commit messages following conventional commits
- **Documentation**: JSDoc for functions, inline comments for complex logic

### Development Workflow

This section describes the recommended end-to-end workflow for contributing changes.

#### Git & Branching

1. **Fork and clone** the repository to your local machine.
2. **Create a topic branch** from the latest `main`:
    - Use a descriptive name, e.g. `feature/budget-alerts`, `fix/auth-timeout`, `docs/testing-updates`.
3. **Keep your branch up to date**:
    - Regularly pull from `upstream main` and rebase or merge as needed.
4. **One logical change per branch/PR**:
    - Avoid mixing unrelated refactors, features, and fixes in the same PR.

#### Local Development Loop

1. Run the app locally:
    - `npm run dev` from the project root to start both frontend and backend.
2. Make focused changes in backend, frontend, or docs.
3. Run tests and linters (see Testing Requirements below).
4. Commit with clear messages (conventional style preferred, e.g. `feat: add budget alerts`, `fix: handle jwt expiry`, `docs: update testing guide`).

#### Pull Request Flow

1. Push your topic branch to your fork.
2. Open a PR against `csxark/Wealth-Vault:main`.
3. Fill in the PR template completely:
    - Summary, linked issues (e.g. `Fixes #123`), implementation notes, screenshots for UI changes, and testing steps.
4. Address review comments promptly and push updates as additional commits (no force-push required unless requested).

> **Note:** Direct pushes to `main` are not allowed. All changes must go through a pull request.

### Testing Requirements

Before requesting review, ensure you have run the relevant tests locally:

- **Backend (Node + Jest)**
   - From project root: `npm test` (runs backend Jest tests).
   - Or from `backend/`: `npm test`, `npm test -- --coverage` if you changed backend logic.

- **Frontend (Vite + Vitest + ESLint)**
   - From `frontend/`: `npm test` for unit/component tests.
   - `npm run test:coverage` for coverage if you touched critical components.
   - `npm run lint` to ensure there are no linting errors.

- **End-to-End (Playwright)**
   - For changes that impact key user flows (auth, dashboard, core journeys), run:
      - `npx playwright install` (first time only).
      - `npx playwright test` from the repo root.
   - Full E2E coverage is a work in progress, but new critical flows should ship with or extend E2E tests where possible.

Include a short **“Testing”** section in your PR description summarizing what you ran, for example:

> Testing: `npm test` (backend), `cd frontend && npm test`, `npx playwright test`

### Code Review Process

- **Approvals required**
   - All PRs must receive at least one maintainer approval before merging.

- **Review focus areas**
   - Correctness and maintainability of the implementation.
   - Security and data privacy (auth, multi-tenancy, permissions, PII access).
   - Performance implications for hot paths and heavy queries.
   - Testing coverage appropriate to the change scope.
   - Documentation updates when behavior or workflows change.

- **Reviewer & author expectations**
   - Reviews should be constructive, specific, and respectful.
   - Authors should respond to all comments, either by making changes or explaining why a change is not needed.
   - Large PRs may be asked to be split into smaller, more focused ones.

### Deployment & Release Considerations

While maintainers typically handle production deployments, contributors should keep deployment in mind:

- **Environment variables and config**
   - Document any new env vars in `README.md` and/or relevant docs (e.g. `DOCKER_GUIDE.md`).
   - Provide sensible defaults for local development.

- **Database changes**
   - Add migrations via Drizzle when changing the schema.
   - Ensure migrations are idempotent and safe to run in production environments.

- **Backward compatibility**
   - Avoid breaking existing APIs or flows when possible.
   - If a breaking change is unavoidable, clearly document it in the PR and related docs.

- **Deployment validation**
   - For changes that impact deployment (e.g. Docker, Nginx, env vars), call out any additional steps required after merging.

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

The PostgreSQL + Drizzle ORM architecture provides a robust foundation for financial data management:

- Database migration system for schema evolution
- Automated backup and disaster recovery procedures
- Database performance monitoring and optimization
- Enhanced schema validation and data integrity checks
- Complex analytical queries for financial insights
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
  - We have templates for: Bug Reports, Feature Requests, Documentation Issues, and Security Concerns
  - Choose the appropriate template when creating a new issue
  - Fill out all required fields to help us understand and address your issue quickly
- **Discussions**: Use GitHub Discussions for questions and ideas
- **Pull Requests**: Follow the PR template and provide detailed descriptions
  - Our PR template includes sections for description, testing steps, and checklists
  - Link all related issues in your PR description
  - Ensure all checklist items are completed before requesting review
- **Code Reviews**: Be constructive and respectful

## Using Issue and PR Templates

### Creating an Issue

When creating a new issue, you'll be presented with template options:

1. **🐛 Bug Report** - For reporting bugs and unexpected behavior
2. **💡 Feature Request** - For suggesting new features or enhancements
3. **📚 Documentation Issue** - For reporting documentation problems
4. **🔒 Security Vulnerability** - For security concerns (use private reporting for critical issues)

Select the appropriate template and fill in all required fields. This helps maintainers understand and address your issue quickly.

### Creating a Pull Request

All pull requests must use the PR template, which includes:

- Clear description of changes
- Related issue links
- Type of change checkboxes
- Implementation details
- Testing steps and evidence
- Comprehensive checklist covering code quality, documentation, testing, and security

**Important PR Guidelines:**

- Mark all applicable checkboxes before requesting review
- Include screenshots/demos for UI changes
- Describe testing performed and environments tested
- Note any breaking changes or deployment considerations
- Tag relevant reviewers if you need specific feedback

Thank you for contributing to Wealth Vault! Your efforts help users achieve better financial wellness.</content>
