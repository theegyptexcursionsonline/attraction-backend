import { Router } from 'express';
import { env } from '../config';
import authRoutes from './auth.routes';
import attractionsRoutes from './attractions.routes';
import bookingsRoutes from './bookings.routes';
import categoriesRoutes from './categories.routes';
import destinationsRoutes from './destinations.routes';
import reviewsRoutes from './reviews.routes';
import tenantsRoutes from './tenants.routes';
import usersRoutes from './users.routes';
import paymentsRoutes from './payments.routes';
import uploadRoutes from './upload.routes';
import contactRoutes from './contact.routes';
import statsRoutes from './stats.routes';
import promoRoutes from './promo.routes';
import notificationsRoutes from './notifications.routes';
import specialOffersRoutes from './specialOffers.routes';
import rsvpsRoutes from './rsvps.routes';
import previewRoutes from './preview.routes';
import pageRoutes from './page.routes';
import blogRoutes from './blog.routes';
import contentRoutes from './content.routes';
import apiKeysRoutes from './apiKeys.routes';
import webhooksRoutes from './webhooks.routes';

const router = Router();

// Health check
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'API is running',
    status: 'operational',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  });
});

// Stats routes (public)
router.use('/stats', statsRoutes);

// API Documentation - Homepage (HTML)
router.get('/', (req, res) => {
  const baseUrl = `${req.protocol}://${req.get('host')}/api`;
  const testAccountsSection = env.isDev
    ? `
    <div class="test-accounts">
      <h3>Test Accounts (Development only)</h3>
      <div class="account">
        <span>Admin:</span>
        <code>admin@attractions-network.com</code>
        <code>Admin@123456</code>
      </div>
      <div class="account">
        <span>Customer:</span>
        <code>customer@example.com</code>
        <code>Customer@123</code>
      </div>
    </div>
    `
    : '';
  
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Attractions Network API</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif; background: #0f172a; color: #e2e8f0; line-height: 1.6; }
    .container { max-width: 1200px; margin: 0 auto; padding: 2rem; }
    header { text-align: center; padding: 3rem 0; border-bottom: 1px solid #334155; margin-bottom: 2rem; }
    h1 { font-size: 2.5rem; color: #fff; margin-bottom: 0.5rem; }
    .version { background: #22c55e; color: #fff; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.875rem; display: inline-block; margin-bottom: 1rem; }
    .status { display: flex; align-items: center; justify-content: center; gap: 0.5rem; color: #22c55e; }
    .status-dot { width: 10px; height: 10px; background: #22c55e; border-radius: 50%; animation: pulse 2s infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
    .description { color: #94a3b8; margin-top: 1rem; }
    
    .quick-links { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
    .quick-link { background: #1e293b; padding: 1rem; border-radius: 0.5rem; text-decoration: none; color: #60a5fa; border: 1px solid #334155; transition: all 0.2s; }
    .quick-link:hover { background: #334155; border-color: #60a5fa; }
    .quick-link span { display: block; color: #94a3b8; font-size: 0.875rem; margin-top: 0.25rem; }
    
    .test-accounts { background: #1e293b; padding: 1.5rem; border-radius: 0.5rem; margin-bottom: 2rem; border: 1px solid #334155; }
    .test-accounts h3 { color: #fff; margin-bottom: 1rem; }
    .account { display: flex; gap: 2rem; margin-bottom: 0.5rem; }
    .account code { background: #0f172a; padding: 0.25rem 0.5rem; border-radius: 0.25rem; font-family: monospace; }
    
    .section { margin-bottom: 2rem; }
    .section-title { font-size: 1.5rem; color: #fff; margin-bottom: 1rem; padding-bottom: 0.5rem; border-bottom: 1px solid #334155; display: flex; align-items: center; gap: 0.5rem; }
    .section-title .icon { font-size: 1.25rem; }
    
    .endpoint-group { background: #1e293b; border-radius: 0.5rem; margin-bottom: 1rem; overflow: hidden; border: 1px solid #334155; }
    .endpoint-group-header { background: #334155; padding: 1rem; font-weight: 600; color: #fff; display: flex; justify-content: space-between; align-items: center; }
    .endpoint-group-header code { background: #0f172a; padding: 0.25rem 0.5rem; border-radius: 0.25rem; font-size: 0.875rem; }
    
    .endpoint { display: grid; grid-template-columns: 80px 1fr auto; gap: 1rem; padding: 0.75rem 1rem; border-bottom: 1px solid #334155; align-items: center; }
    .endpoint:last-child { border-bottom: none; }
    .endpoint:hover { background: #334155; }
    
    .method { font-weight: 600; font-size: 0.75rem; padding: 0.25rem 0.5rem; border-radius: 0.25rem; text-align: center; }
    .method.GET { background: #22c55e20; color: #22c55e; }
    .method.POST { background: #3b82f620; color: #3b82f6; }
    .method.PATCH { background: #f59e0b20; color: #f59e0b; }
    .method.DELETE { background: #ef444420; color: #ef4444; }
    
    .endpoint-info { display: flex; flex-direction: column; gap: 0.25rem; }
    .endpoint-path { font-family: monospace; color: #fff; }
    .endpoint-desc { font-size: 0.875rem; color: #94a3b8; }
    
    .auth-badge { font-size: 0.75rem; padding: 0.25rem 0.5rem; border-radius: 0.25rem; }
    .auth-badge.public { background: #22c55e20; color: #22c55e; }
    .auth-badge.auth { background: #f59e0b20; color: #f59e0b; }
    .auth-badge.admin { background: #ef444420; color: #ef4444; }
    
    footer { text-align: center; padding: 2rem 0; border-top: 1px solid #334155; margin-top: 2rem; color: #64748b; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Attractions Network API</h1>
      <span class="version">v1.0.0</span>
      <div class="status"><span class="status-dot"></span> Operational</div>
      <p class="description">Multi-tenant B2C marketplace for tours, attractions, and experiences</p>
    </header>
    
    <div class="quick-links">
      <a href="${baseUrl}/docs" class="quick-link" style="background: #3b82f6; border-color: #3b82f6; color: #fff;">Swagger Docs<span style="color: #dbeafe;">Interactive API Documentation</span></a>
      <a href="${baseUrl}/health" class="quick-link">Health Check<span>GET /api/health</span></a>
      <a href="${baseUrl}/categories" class="quick-link">Categories<span>GET /api/categories</span></a>
      <a href="${baseUrl}/destinations" class="quick-link">Destinations<span>GET /api/destinations</span></a>
      <a href="${baseUrl}/attractions" class="quick-link">Attractions<span>GET /api/attractions</span></a>
      <a href="${baseUrl}/attractions/featured" class="quick-link">Featured<span>GET /api/attractions/featured</span></a>
    </div>
    
    ${testAccountsSection}
    
    <div class="section">
      <h2 class="section-title"><span class="icon">🔐</span> Authentication</h2>
      <div class="endpoint-group">
        <div class="endpoint-group-header">Auth <code>/api/auth</code></div>
        <div class="endpoint"><span class="method POST">POST</span><div class="endpoint-info"><span class="endpoint-path">/register</span><span class="endpoint-desc">Register new user</span></div><span class="auth-badge public">Public</span></div>
        <div class="endpoint"><span class="method POST">POST</span><div class="endpoint-info"><span class="endpoint-path">/login</span><span class="endpoint-desc">Login user</span></div><span class="auth-badge public">Public</span></div>
        <div class="endpoint"><span class="method POST">POST</span><div class="endpoint-info"><span class="endpoint-path">/logout</span><span class="endpoint-desc">Logout user</span></div><span class="auth-badge auth">Auth</span></div>
        <div class="endpoint"><span class="method POST">POST</span><div class="endpoint-info"><span class="endpoint-path">/refresh-token</span><span class="endpoint-desc">Refresh access token</span></div><span class="auth-badge public">Public</span></div>
        <div class="endpoint"><span class="method GET">GET</span><div class="endpoint-info"><span class="endpoint-path">/me</span><span class="endpoint-desc">Get current user</span></div><span class="auth-badge auth">Auth</span></div>
        <div class="endpoint"><span class="method PATCH">PATCH</span><div class="endpoint-info"><span class="endpoint-path">/profile</span><span class="endpoint-desc">Update profile</span></div><span class="auth-badge auth">Auth</span></div>
        <div class="endpoint"><span class="method POST">POST</span><div class="endpoint-info"><span class="endpoint-path">/change-password</span><span class="endpoint-desc">Change password</span></div><span class="auth-badge auth">Auth</span></div>
        <div class="endpoint"><span class="method POST">POST</span><div class="endpoint-info"><span class="endpoint-path">/forgot-password</span><span class="endpoint-desc">Request password reset</span></div><span class="auth-badge public">Public</span></div>
        <div class="endpoint"><span class="method POST">POST</span><div class="endpoint-info"><span class="endpoint-path">/reset-password</span><span class="endpoint-desc">Reset password with token</span></div><span class="auth-badge public">Public</span></div>
      </div>
    </div>
    
    <div class="section">
      <h2 class="section-title"><span class="icon">🎢</span> Attractions</h2>
      <div class="endpoint-group">
        <div class="endpoint-group-header">Attractions <code>/api/attractions</code></div>
        <div class="endpoint"><span class="method GET">GET</span><div class="endpoint-info"><span class="endpoint-path">/</span><span class="endpoint-desc">List attractions (with filters)</span></div><span class="auth-badge public">Public</span></div>
        <div class="endpoint"><span class="method GET">GET</span><div class="endpoint-info"><span class="endpoint-path">/featured</span><span class="endpoint-desc">Get featured attractions</span></div><span class="auth-badge public">Public</span></div>
        <div class="endpoint"><span class="method GET">GET</span><div class="endpoint-info"><span class="endpoint-path">/:slug</span><span class="endpoint-desc">Get attraction by slug</span></div><span class="auth-badge public">Public</span></div>
        <div class="endpoint"><span class="method GET">GET</span><div class="endpoint-info"><span class="endpoint-path">/:id/reviews</span><span class="endpoint-desc">Get attraction reviews</span></div><span class="auth-badge public">Public</span></div>
        <div class="endpoint"><span class="method GET">GET</span><div class="endpoint-info"><span class="endpoint-path">/:id/availability</span><span class="endpoint-desc">Get availability</span></div><span class="auth-badge public">Public</span></div>
        <div class="endpoint"><span class="method POST">POST</span><div class="endpoint-info"><span class="endpoint-path">/</span><span class="endpoint-desc">Create attraction</span></div><span class="auth-badge admin">Admin</span></div>
        <div class="endpoint"><span class="method PATCH">PATCH</span><div class="endpoint-info"><span class="endpoint-path">/:id</span><span class="endpoint-desc">Update attraction</span></div><span class="auth-badge admin">Admin</span></div>
        <div class="endpoint"><span class="method DELETE">DELETE</span><div class="endpoint-info"><span class="endpoint-path">/:id</span><span class="endpoint-desc">Delete attraction</span></div><span class="auth-badge admin">Admin</span></div>
      </div>
    </div>
    
    <div class="section">
      <h2 class="section-title"><span class="icon">🎫</span> Bookings</h2>
      <div class="endpoint-group">
        <div class="endpoint-group-header">Bookings <code>/api/bookings</code></div>
        <div class="endpoint"><span class="method POST">POST</span><div class="endpoint-info"><span class="endpoint-path">/</span><span class="endpoint-desc">Create booking</span></div><span class="auth-badge public">Optional</span></div>
        <div class="endpoint"><span class="method GET">GET</span><div class="endpoint-info"><span class="endpoint-path">/reference/:reference</span><span class="endpoint-desc">Get booking by reference</span></div><span class="auth-badge auth">Auth</span></div>
        <div class="endpoint"><span class="method GET">GET</span><div class="endpoint-info"><span class="endpoint-path">/my</span><span class="endpoint-desc">Get user bookings</span></div><span class="auth-badge auth">Auth</span></div>
        <div class="endpoint"><span class="method PATCH">PATCH</span><div class="endpoint-info"><span class="endpoint-path">/:id/cancel</span><span class="endpoint-desc">Cancel booking</span></div><span class="auth-badge auth">Auth</span></div>
        <div class="endpoint"><span class="method GET">GET</span><div class="endpoint-info"><span class="endpoint-path">/:id/ticket</span><span class="endpoint-desc">Download ticket PDF</span></div><span class="auth-badge auth">Auth</span></div>
        <div class="endpoint"><span class="method GET">GET</span><div class="endpoint-info"><span class="endpoint-path">/admin</span><span class="endpoint-desc">List all bookings</span></div><span class="auth-badge admin">Admin</span></div>
        <div class="endpoint"><span class="method GET">GET</span><div class="endpoint-info"><span class="endpoint-path">/admin/stats</span><span class="endpoint-desc">Booking statistics</span></div><span class="auth-badge admin">Admin</span></div>
        <div class="endpoint"><span class="method PATCH">PATCH</span><div class="endpoint-info"><span class="endpoint-path">/admin/:id</span><span class="endpoint-desc">Update booking status</span></div><span class="auth-badge admin">Admin</span></div>
      </div>
    </div>
    
    <div class="section">
      <h2 class="section-title"><span class="icon">📁</span> Categories</h2>
      <div class="endpoint-group">
        <div class="endpoint-group-header">Categories <code>/api/categories</code></div>
        <div class="endpoint"><span class="method GET">GET</span><div class="endpoint-info"><span class="endpoint-path">/</span><span class="endpoint-desc">List all categories</span></div><span class="auth-badge public">Public</span></div>
        <div class="endpoint"><span class="method GET">GET</span><div class="endpoint-info"><span class="endpoint-path">/:slug</span><span class="endpoint-desc">Get category by slug</span></div><span class="auth-badge public">Public</span></div>
        <div class="endpoint"><span class="method POST">POST</span><div class="endpoint-info"><span class="endpoint-path">/</span><span class="endpoint-desc">Create category</span></div><span class="auth-badge admin">Admin</span></div>
        <div class="endpoint"><span class="method PATCH">PATCH</span><div class="endpoint-info"><span class="endpoint-path">/:id</span><span class="endpoint-desc">Update category</span></div><span class="auth-badge admin">Admin</span></div>
        <div class="endpoint"><span class="method DELETE">DELETE</span><div class="endpoint-info"><span class="endpoint-path">/:id</span><span class="endpoint-desc">Delete category</span></div><span class="auth-badge admin">Admin</span></div>
      </div>
    </div>
    
    <div class="section">
      <h2 class="section-title"><span class="icon">🌍</span> Destinations</h2>
      <div class="endpoint-group">
        <div class="endpoint-group-header">Destinations <code>/api/destinations</code></div>
        <div class="endpoint"><span class="method GET">GET</span><div class="endpoint-info"><span class="endpoint-path">/</span><span class="endpoint-desc">List destinations</span></div><span class="auth-badge public">Public</span></div>
        <div class="endpoint"><span class="method GET">GET</span><div class="endpoint-info"><span class="endpoint-path">/featured</span><span class="endpoint-desc">Get featured destinations</span></div><span class="auth-badge public">Public</span></div>
        <div class="endpoint"><span class="method GET">GET</span><div class="endpoint-info"><span class="endpoint-path">/:slug</span><span class="endpoint-desc">Get destination by slug</span></div><span class="auth-badge public">Public</span></div>
        <div class="endpoint"><span class="method POST">POST</span><div class="endpoint-info"><span class="endpoint-path">/</span><span class="endpoint-desc">Create destination</span></div><span class="auth-badge admin">Admin</span></div>
        <div class="endpoint"><span class="method PATCH">PATCH</span><div class="endpoint-info"><span class="endpoint-path">/:id</span><span class="endpoint-desc">Update destination</span></div><span class="auth-badge admin">Admin</span></div>
        <div class="endpoint"><span class="method DELETE">DELETE</span><div class="endpoint-info"><span class="endpoint-path">/:id</span><span class="endpoint-desc">Delete destination</span></div><span class="auth-badge admin">Admin</span></div>
      </div>
    </div>
    
    <div class="section">
      <h2 class="section-title"><span class="icon">🏢</span> Tenants</h2>
      <div class="endpoint-group">
        <div class="endpoint-group-header">Tenants <code>/api/tenants</code></div>
        <div class="endpoint"><span class="method GET">GET</span><div class="endpoint-info"><span class="endpoint-path">/by-slug/:slug</span><span class="endpoint-desc">Get tenant by slug</span></div><span class="auth-badge public">Public</span></div>
        <div class="endpoint"><span class="method GET">GET</span><div class="endpoint-info"><span class="endpoint-path">/</span><span class="endpoint-desc">List all tenants</span></div><span class="auth-badge admin">Admin</span></div>
        <div class="endpoint"><span class="method GET">GET</span><div class="endpoint-info"><span class="endpoint-path">/:id</span><span class="endpoint-desc">Get tenant by ID</span></div><span class="auth-badge admin">Admin</span></div>
        <div class="endpoint"><span class="method GET">GET</span><div class="endpoint-info"><span class="endpoint-path">/:id/stats</span><span class="endpoint-desc">Get tenant statistics</span></div><span class="auth-badge admin">Admin</span></div>
        <div class="endpoint"><span class="method POST">POST</span><div class="endpoint-info"><span class="endpoint-path">/</span><span class="endpoint-desc">Create tenant</span></div><span class="auth-badge admin">Super Admin</span></div>
        <div class="endpoint"><span class="method PATCH">PATCH</span><div class="endpoint-info"><span class="endpoint-path">/:id</span><span class="endpoint-desc">Update tenant</span></div><span class="auth-badge admin">Super Admin</span></div>
        <div class="endpoint"><span class="method DELETE">DELETE</span><div class="endpoint-info"><span class="endpoint-path">/:id</span><span class="endpoint-desc">Delete tenant</span></div><span class="auth-badge admin">Super Admin</span></div>
      </div>
    </div>
    
    <div class="section">
      <h2 class="section-title"><span class="icon">👥</span> Users</h2>
      <div class="endpoint-group">
        <div class="endpoint-group-header">Users <code>/api/users</code></div>
        <div class="endpoint"><span class="method GET">GET</span><div class="endpoint-info"><span class="endpoint-path">/profile</span><span class="endpoint-desc">Get user profile</span></div><span class="auth-badge auth">Auth</span></div>
        <div class="endpoint"><span class="method GET">GET</span><div class="endpoint-info"><span class="endpoint-path">/wishlist</span><span class="endpoint-desc">Get wishlist</span></div><span class="auth-badge auth">Auth</span></div>
        <div class="endpoint"><span class="method POST">POST</span><div class="endpoint-info"><span class="endpoint-path">/wishlist/:attractionId</span><span class="endpoint-desc">Add to wishlist</span></div><span class="auth-badge auth">Auth</span></div>
        <div class="endpoint"><span class="method DELETE">DELETE</span><div class="endpoint-info"><span class="endpoint-path">/wishlist/:attractionId</span><span class="endpoint-desc">Remove from wishlist</span></div><span class="auth-badge auth">Auth</span></div>
        <div class="endpoint"><span class="method GET">GET</span><div class="endpoint-info"><span class="endpoint-path">/</span><span class="endpoint-desc">List users</span></div><span class="auth-badge admin">Admin</span></div>
        <div class="endpoint"><span class="method POST">POST</span><div class="endpoint-info"><span class="endpoint-path">/invite</span><span class="endpoint-desc">Invite user</span></div><span class="auth-badge admin">Admin</span></div>
        <div class="endpoint"><span class="method PATCH">PATCH</span><div class="endpoint-info"><span class="endpoint-path">/:id</span><span class="endpoint-desc">Update user</span></div><span class="auth-badge admin">Admin</span></div>
        <div class="endpoint"><span class="method DELETE">DELETE</span><div class="endpoint-info"><span class="endpoint-path">/:id</span><span class="endpoint-desc">Delete user</span></div><span class="auth-badge admin">Admin</span></div>
      </div>
    </div>
    
    <div class="section">
      <h2 class="section-title"><span class="icon">💳</span> Payments</h2>
      <div class="endpoint-group">
        <div class="endpoint-group-header">Payments <code>/api/payments</code></div>
        <div class="endpoint"><span class="method POST">POST</span><div class="endpoint-info"><span class="endpoint-path">/create-intent</span><span class="endpoint-desc">Create Stripe PaymentIntent</span></div><span class="auth-badge auth">Auth</span></div>
        <div class="endpoint"><span class="method POST">POST</span><div class="endpoint-info"><span class="endpoint-path">/webhook</span><span class="endpoint-desc">Stripe webhook</span></div><span class="auth-badge public">Public</span></div>
        <div class="endpoint"><span class="method GET">GET</span><div class="endpoint-info"><span class="endpoint-path">/:bookingId/status</span><span class="endpoint-desc">Get payment status</span></div><span class="auth-badge auth">Auth</span></div>
        <div class="endpoint"><span class="method POST">POST</span><div class="endpoint-info"><span class="endpoint-path">/:bookingId/refund</span><span class="endpoint-desc">Refund payment</span></div><span class="auth-badge admin">Admin</span></div>
      </div>
    </div>
    
    <footer>
      <p>Attractions Network API &copy; ${new Date().getFullYear()} | Server Time: ${new Date().toISOString()}</p>
    </footer>
  </div>
</body>
</html>
  `;
  
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

// API routes
router.use('/auth', authRoutes);
router.use('/attractions', attractionsRoutes);
router.use('/bookings', bookingsRoutes);
router.use('/categories', categoriesRoutes);
router.use('/destinations', destinationsRoutes);
router.use('/reviews', reviewsRoutes);
router.use('/tenants', tenantsRoutes);
router.use('/users', usersRoutes);
router.use('/payments', paymentsRoutes);
router.use('/upload', uploadRoutes);
router.use('/contact', contactRoutes);
router.use('/promo-codes', promoRoutes);
router.use('/notifications', notificationsRoutes);
router.use('/special-offers', specialOffersRoutes);
router.use('/rsvps', rsvpsRoutes);
router.use('/preview', previewRoutes);
router.use('/page', pageRoutes);
router.use('/blog', blogRoutes);

// Programmatic API keys + outbound webhooks (tenant-scoped, admin-managed)
router.use('/api-keys', apiKeysRoutes);
router.use('/webhooks', webhooksRoutes);

// foxes-content-engine publishing bridge (Bearer CONTENT_ENGINE_API_KEY)
router.use('/admin/content', contentRoutes);

// Admin routes aliases
router.use('/admin/attractions', attractionsRoutes);
router.use('/admin/bookings', bookingsRoutes);
router.use('/admin/categories', categoriesRoutes);
router.use('/admin/destinations', destinationsRoutes);
router.use('/admin/tenants', tenantsRoutes);
router.use('/admin/users', usersRoutes);

export default router;
