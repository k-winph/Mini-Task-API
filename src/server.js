require('dotenv').config();
const app = require('./app');
const chalk = require('chalk');

const PORT = process.env.PORT || 3000;
const ENV = process.env.NODE_ENV || 'development';
const DB_URL = process.env.DATABASE_URL || 'not specified';

// ✅ แสดงผลสวยงาม
app.listen(PORT, () => {
  console.clear();
  console.log(chalk.green.bold('✅ Database connected successfully\n'));

  console.log('===========================================');
  console.log(chalk.magentaBright.bold('🚀 Mini Task API Server Started'));
  console.log('===========================================\n');

  console.log(`📍 Server running on: ${chalk.cyan(`http://localhost:${PORT}`)}`);
  console.log(`🌐 Environment: ${chalk.yellow(ENV)}`);
  console.log(`🗄️  Database: ${chalk.green(DB_URL.split('/').pop().replace('"', ''))}\n`);

  console.log('===========================================');
  console.log(chalk.bold('📜 Available Endpoints:\n'));

  const endpoints = [
    { method: 'POST', path: '/api/v1/auth/register', desc: 'Register new user' },
    { method: 'POST', path: '/api/v1/auth/login', desc: 'Login' },
    { method: 'POST', path: '/api/v1/auth/refresh', desc: 'Refresh token' },
    { method: 'POST', path: '/api/v1/auth/logout', desc: 'Logout' },

    { method: 'GET', path: '/api/v1/users/me', desc: 'Get current user' },
    { method: 'PUT', path: '/api/v1/users/me', desc: 'Update current user' },
    { method: 'DELETE', path: '/api/v1/users/me', desc: 'Delete current user' },
    { method: 'GET', path: '/api/v1/users', desc: 'List all users (admin only)' },

    { method: 'POST', path: '/api/v1/tasks', desc: 'Create task (Idempotency-Key required)' },
    { method: 'GET', path: '/api/v1/tasks', desc: 'List tasks (filtering supported)' },
    { method: 'GET', path: '/api/v1/tasks/:id', desc: 'Get task by ID' },
    { method: 'PUT', path: '/api/v1/tasks/:id', desc: 'Full update task' },
    { method: 'PATCH', path: '/api/v1/tasks/:id/status', desc: 'Update task status' },
    { method: 'DELETE', path: '/api/v1/tasks/:id', desc: 'Delete task' },
  ];

  endpoints.forEach(e => {
    console.log(
      `${chalk.green(e.method.padEnd(6))} ${chalk.cyan(e.path.padEnd(30))} - ${chalk.white(e.desc)}`
    );
  });

  console.log('\n===========================================\n');
});
