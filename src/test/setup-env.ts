process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-secret-key-at-least-32-characters-long';

// Never send real email from the test suite. Force the Mailgun credentials empty
// BEFORE the env/dotenv module loads (dotenv does not override an already-set key),
// so the email service never creates a client and every send() early-returns.
// A booking-integration test that reaches createBooking's notification side-effect
// once sent real "Test User booked …" mail to the client inbox — never again.
process.env.MAILGUN_API_KEY = '';
process.env.MAILGUN_DOMAIN = '';
