import swaggerJsdoc from "swagger-jsdoc";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "AquaVista API",
      version: "1.0.0",
      description: "AquaVista Backend API — Node.js/Express/MongoDB",
    },
    servers: [
      {
        url: process.env.NODE_ENV === "production"
          ? "https://aquavista-be.vercel.app"
          : `http://localhost:${process.env.PORT || 5000}`,
        description: process.env.NODE_ENV === "production" ? "Production" : "Development",
      },
    ],
    components: {
      securitySchemes: {
        cookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: "access_token",
        },
      },
      schemas: {
        User: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            email: { type: "string", format: "email" },
            company: { type: "string" },
            role: { type: "string", enum: ["admin", "project_user"] },
            status: { type: "string", enum: ["active", "pending", "inactive"] },
            authProvider: { type: "string", enum: ["local", "github", "google"] },
            image: { type: "string", nullable: true },
          },
        },
        Project: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            municipality: { type: "string" },
            description: { type: "string" },
            teamCount: { type: "number" },
            fileCount: { type: "number" },
          },
        },
        Chat: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            projectId: { type: "string" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        Notification: {
          type: "object",
          properties: {
            id: { type: "string" },
            type: { type: "string" },
            category: { type: "string" },
            title: { type: "string" },
            message: { type: "string" },
            read: { type: "boolean" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
      },
    },
    security: [{ cookieAuth: [] }],
  },
  apis: ["./src/routes/*.ts"],
};

export const swaggerSpec = swaggerJsdoc(options);
