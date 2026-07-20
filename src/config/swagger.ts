import swaggerJsdoc from 'swagger-jsdoc';
import { env } from './env';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Attractions Network API',
      version: '1.0.0',
      description: 'Multi-tenant B2C marketplace for tours, attractions, and experiences',
      contact: {
        name: 'API Support',
        email: 'support@attractions-network.com',
      },
      license: {
        name: 'Proprietary',
      },
    },
    servers: [
      {
        url: `http://localhost:${env.port}/api`,
        description: 'Development server',
      },
      {
        url: 'https://api.attractions-network.com/api',
        description: 'Production server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your JWT token',
        },
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'accessToken',
          description: 'JWT token stored in cookie',
        },
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            _id: { type: 'string', example: '507f1f77bcf86cd799439011' },
            email: { type: 'string', format: 'email', example: 'user@example.com' },
            firstName: { type: 'string', example: 'John' },
            lastName: { type: 'string', example: 'Doe' },
            role: { type: 'string', enum: ['super-admin', 'brand-admin', 'manager', 'editor', 'viewer', 'customer'], example: 'customer' },
            status: { type: 'string', enum: ['active', 'inactive', 'suspended'], example: 'active' },
            avatar: { type: 'string', example: 'https://example.com/avatar.jpg' },
            phone: { type: 'string', example: '+1234567890' },
            country: { type: 'string', example: 'United States' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Attraction: {
          type: 'object',
          properties: {
            _id: { type: 'string', example: '507f1f77bcf86cd799439011' },
            slug: { type: 'string', example: 'burj-khalifa-at-the-top' },
            title: { type: 'string', example: 'Burj Khalifa: At The Top Observation Deck' },
            shortDescription: { type: 'string', example: 'Experience breathtaking 360-degree views' },
            description: { type: 'string', example: 'Full description of the attraction...' },
            images: { type: 'array', items: { type: 'string' } },
            category: { type: 'string', example: 'landmarks' },
            destination: {
              type: 'object',
              properties: {
                city: { type: 'string', example: 'Dubai' },
                country: { type: 'string', example: 'UAE' },
              },
            },
            duration: { type: 'string', example: '1-2 hours' },
            rating: { type: 'number', example: 4.8 },
            reviewCount: { type: 'integer', example: 12453 },
            priceFrom: { type: 'number', example: 149 },
            currency: { type: 'string', example: 'AED' },
            badges: { type: 'array', items: { type: 'string' }, example: ['bestseller', 'skip-line'] },
            status: { type: 'string', enum: ['active', 'inactive', 'draft'], example: 'active' },
            featured: { type: 'boolean', example: true },
          },
        },
        Booking: {
          type: 'object',
          properties: {
            _id: { type: 'string', example: '507f1f77bcf86cd799439011' },
            reference: { type: 'string', example: 'AN-ABC123' },
            userId: { type: 'string', example: '507f1f77bcf86cd799439011' },
            attractionId: { type: 'string', example: '507f1f77bcf86cd799439011' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  optionId: { type: 'string' },
                  optionName: { type: 'string' },
                  date: { type: 'string', format: 'date' },
                  time: { type: 'string' },
                  quantities: {
                    type: 'object',
                    properties: {
                      adults: { type: 'integer' },
                      children: { type: 'integer' },
                      infants: { type: 'integer' },
                    },
                  },
                  unitPrice: { type: 'number' },
                  totalPrice: { type: 'number' },
                },
              },
            },
            guestDetails: {
              type: 'object',
              properties: {
                firstName: { type: 'string' },
                lastName: { type: 'string' },
                email: { type: 'string', format: 'email' },
                phone: { type: 'string' },
              },
            },
            subtotal: { type: 'number', example: 298 },
            total: { type: 'number', example: 298 },
            currency: { type: 'string', example: 'AED' },
            status: { type: 'string', enum: ['pending', 'confirmed', 'cancelled', 'completed', 'refunded'], example: 'confirmed' },
            paymentStatus: { type: 'string', enum: ['pending', 'paid', 'failed', 'refunded'], example: 'paid' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Category: {
          type: 'object',
          properties: {
            _id: { type: 'string', example: '507f1f77bcf86cd799439011' },
            slug: { type: 'string', example: 'museums' },
            name: { type: 'string', example: 'Museums & Galleries' },
            icon: { type: 'string', example: 'Building2' },
            description: { type: 'string', example: 'Explore world-class museums and art galleries' },
            sortOrder: { type: 'integer', example: 1 },
            isActive: { type: 'boolean', example: true },
            attractionCount: { type: 'integer', example: 45 },
          },
        },
        Destination: {
          type: 'object',
          properties: {
            _id: { type: 'string', example: '507f1f77bcf86cd799439011' },
            slug: { type: 'string', example: 'dubai' },
            name: { type: 'string', example: 'Dubai' },
            country: { type: 'string', example: 'UAE' },
            continent: { type: 'string', example: 'Asia' },
            description: { type: 'string', example: 'City of superlatives...' },
            images: { type: 'array', items: { type: 'string' } },
            highlights: { type: 'array', items: { type: 'string' }, example: ['Burj Khalifa', 'Desert Safari'] },
            attractionCount: { type: 'integer', example: 120 },
          },
        },
        Tenant: {
          type: 'object',
          properties: {
            _id: { type: 'string', example: '507f1f77bcf86cd799439011' },
            slug: { type: 'string', example: 'dubai-attractions' },
            name: { type: 'string', example: 'Dubai Attractions' },
            domain: { type: 'string', example: 'dubai-attractions.com' },
            logo: { type: 'string', example: 'https://example.com/logo.png' },
            tagline: { type: 'string', example: 'Discover the Magic of Dubai' },
            status: { type: 'string', enum: ['active', 'inactive', 'suspended'], example: 'active' },
          },
        },
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string', example: 'Error message' },
          },
        },
        Success: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'Operation successful' },
            data: { type: 'object' },
          },
        },
        Pagination: {
          type: 'object',
          properties: {
            page: { type: 'integer', example: 1 },
            limit: { type: 'integer', example: 20 },
            total: { type: 'integer', example: 100 },
            totalPages: { type: 'integer', example: 5 },
          },
        },
        LoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email', example: 'customer@example.com' },
            password: { type: 'string', format: 'password', example: 'Customer@123' },
            rememberMe: { type: 'boolean', example: false },
          },
        },
        RegisterRequest: {
          type: 'object',
          required: ['email', 'password', 'firstName', 'lastName'],
          properties: {
            email: { type: 'string', format: 'email', example: 'newuser@example.com' },
            password: { type: 'string', format: 'password', minLength: 8, example: 'SecurePass@123' },
            firstName: { type: 'string', example: 'John' },
            lastName: { type: 'string', example: 'Doe' },
          },
        },
        AuthResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'Login successful' },
            data: {
              type: 'object',
              properties: {
                user: { $ref: '#/components/schemas/User' },
              },
            },
          },
        },
        CreateBookingRequest: {
          type: 'object',
          required: ['attractionId', 'items', 'guestDetails'],
          properties: {
            attractionId: { type: 'string', example: '507f1f77bcf86cd799439011' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                required: ['optionId', 'optionName', 'date', 'quantities', 'unitPrice', 'totalPrice'],
                properties: {
                  optionId: { type: 'string', example: 'opt_1' },
                  optionName: { type: 'string', example: 'Standard Entry' },
                  date: { type: 'string', format: 'date', example: '2026-02-15' },
                  time: { type: 'string', example: '10:00' },
                  quantities: {
                    type: 'object',
                    properties: {
                      adults: { type: 'integer', example: 2 },
                      children: { type: 'integer', example: 1 },
                      infants: { type: 'integer', example: 0 },
                    },
                  },
                  unitPrice: { type: 'number', example: 149 },
                  totalPrice: { type: 'number', example: 447 },
                },
              },
            },
            guestDetails: {
              type: 'object',
              required: ['firstName', 'lastName', 'email'],
              properties: {
                firstName: { type: 'string', example: 'John' },
                lastName: { type: 'string', example: 'Doe' },
                email: { type: 'string', format: 'email', example: 'john@example.com' },
                phone: { type: 'string', example: '+1234567890' },
              },
            },
            promoCode: { type: 'string', example: 'SAVE10' },
          },
        },
      },
      responses: {
        UnauthorizedError: {
          description: 'Access token is missing or invalid',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
              example: { success: false, error: 'Unauthorized - Please login' },
            },
          },
        },
        ForbiddenError: {
          description: 'Insufficient permissions',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
              example: { success: false, error: 'Forbidden - Admin access required' },
            },
          },
        },
        NotFoundError: {
          description: 'Resource not found',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
              example: { success: false, error: 'Resource not found' },
            },
          },
        },
        ValidationError: {
          description: 'Validation error',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: false },
                  error: { type: 'string', example: 'Validation failed' },
                  errors: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        field: { type: 'string' },
                        message: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    tags: [
      { name: 'Auth', description: 'Authentication endpoints' },
      { name: 'Attractions', description: 'Attractions management' },
      { name: 'Bookings', description: 'Booking operations' },
      { name: 'Categories', description: 'Category management' },
      { name: 'Destinations', description: 'Destination management' },
      { name: 'Tenants', description: 'Multi-tenant management' },
      { name: 'Users', description: 'User management' },
      { name: 'Payments', description: 'Payment processing' },
    ],
  },
  apis: ['./src/routes/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
