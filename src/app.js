const express = require('express');
const morgan = require('morgan');
const helmet = require('helmet');
const cors = require('cors');

const app = express();

app.set('trust proxy', process.env.TRUST_PROXY === 'true');

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

const optionalAuth = require('./middleware/optionalAuth');
const rateLimiter  = require('./middleware/rateLimiter');

app.use('/api', optionalAuth, rateLimiter);

const v1Tasks = require('./routes/v1/tasks.routes');
const v1Users = require('./routes/v1/users.routes');
const v2Tasks = require('./routes/v2/tasks.routes');
const v1Auth  = require('./routes/v1/auth.routes');

app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/api/v1/tasks', v1Tasks);
app.use('/api/v1/users', v1Users);
app.use('/api/v2/tasks', v2Tasks);
app.use('/api/v1/auth',  v1Auth);

const swaggerUi   = require('swagger-ui-express');
const swaggerSpec = require('./docs/swagger');
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

const errorHandler = require('./middleware/errorHandler');
app.use(errorHandler);

module.exports = app;
