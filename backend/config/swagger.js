import swaggerJsdoc from "swagger-jsdoc";

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Wealth Vault API",
      version: "1.0.0",
      description: `
## Wealth Vault - Financial Wellness API

A comprehensive RESTful API for managing personal finances, tracking expenses, setting financial goals, and getting AI-powered financial advice.

### Features
- 🔐 **Authentication** - JWT-based secure authentication
- 💰 **Expense Tracking** - Full CRUD operations for expenses
- 🎯 **Goal Management** - Set and track financial goals
- 📊 **Categories** - Organize expenses by categories
- 🤖 **AI Coach** - Get personalized financial advice via Gemini AI

### Authentication
Most endpoints require a valid JWT token. Include it in the Authorization header:
\`\`\`
Authorization: Bearer <your_token>
\`\`\`
      `,
      contact: {
        name: "Wealth Vault Team",
        url: "https://github.com/csxark/Wealth-Vault",
      },
      license: {
        name: "MIT",
        url: "https://opensource.org/licenses/MIT",
      },
    },
    servers: [
      {
        url: "http://localhost:5001/api",
        description: "Development server",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Enter your JWT token",
        },
      },
      schemas: {
        User: {
          type: "object",
          properties: {
            _id: { type: "string", format: "uuid" },
            email: { type: "string", format: "email" },
            firstName: { type: "string" },
            lastName: { type: "string" },
            currency: { type: "string", default: "USD" },
            monthlyIncome: { type: "number" },
            monthlyBudget: { type: "number" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        Expense: {
          type: "object",
          properties: {
            _id: { type: "string", format: "uuid" },
            amount: { type: "number" },
            currency: { type: "string" },
            description: { type: "string" },
            category: { type: "string" },
            date: { type: "string", format: "date-time" },
            paymentMethod: {
              type: "string",
              enum: ["cash", "credit_card", "debit_card", "upi", "other"],
            },
          },
          required: ["amount", "description", "category"],
        },
        Goal: {
          type: "object",
          properties: {
            _id: { type: "string", format: "uuid" },
            title: { type: "string" },
            description: { type: "string" },
            targetAmount: { type: "number" },
            currentAmount: { type: "number" },
            deadline: { type: "string", format: "date-time" },
            status: { type: "string", enum: ["active", "completed", "paused"] },
          },
          required: ["title", "targetAmount", "deadline"],
        },
        Category: {
          type: "object",
          properties: {
            _id: { type: "string", format: "uuid" },
            name: { type: "string" },
            description: { type: "string" },
            color: { type: "string" },
            icon: { type: "string" },
            type: { type: "string", enum: ["expense", "income", "both"] },
          },
        },
        Error: {
          type: "object",
          properties: {
            success: { type: "boolean", example: false },
            message: { type: "string" },
          },
        },
        Success: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            message: { type: "string" },
            data: { type: "object" },
          },
        },
      },
      responses: {
        UnauthorizedError: {
          description: "Access token is missing or invalid",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
            },
          },
        },
        NotFoundError: {
          description: "The requested resource was not found",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
            },
          },
        },
        ValidationError: {
          description: "Validation failed",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
            },
          },
        },
        RateLimitError: {
          description: "Too many requests",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: false },
                  message: {
                    type: "string",
                    example: "Too many requests from this IP",
                  },
                  retryAfter: { type: "number", example: 15 },
                },
              },
            },
          },
        },
      },
    },
    tags: [
      {
        name: "Authentication",
        description: "User authentication and registration",
      },
      { name: "Users", description: "User profile management" },
      { name: "Expenses", description: "Expense tracking operations" },
      { name: "Goals", description: "Financial goals management" },
      { name: "Categories", description: "Expense categories" },
      { name: "AI Coach", description: "AI-powered financial advice" },
    ],
  },
  apis: ["./routes/*.js"],
};

export const swaggerSpec = swaggerJsdoc(options);
