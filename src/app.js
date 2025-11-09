// 1) Imports
const express = require('express');
const morgan = require('morgan');
const helmet = require('helmet');
const cors = require('cors');

// 2) สร้างแอปก่อนใช้งาน
const app = express();

// 3) Global middlewares
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// 4) Routes (require หลังจากสร้าง app แล้วโอเค จะ require ก่อน/หลังได้ แต่อย่า app.use ก่อนประกาศ app)
const v1Tasks = require('./routes/v1/tasks.routes');
const v1Users = require('./routes/v1/users.routes');
const v2Tasks = require('./routes/v2/tasks.routes');
const v1Auth = require('./routes/v1/auth.routes');

// (debug ชนิดของตัวแปรได้ แต่ไม่เกี่ยวกับ error นี้)
// console.log('typeof v1Tasks =', typeof v1Tasks);
// console.log('typeof v1Users =', typeof v1Users);
// console.log('typeof v2Tasks =', typeof v2Tasks);

// 5) Health check
app.get('/health', (req, res) => res.json({ ok: true }));

// 6) Versioned routes
app.use('/api/v1/tasks', v1Tasks);
app.use('/api/v1/users', v1Users);
app.use('/api/v2/tasks', v2Tasks);
app.use('/api/v1/auth', v1Auth);

// 7) Error handler (ต้องเป็นฟังก์ชัน)
const errorHandler = require('./middleware/errorHandler');
app.use(errorHandler);

// 8) Export app
module.exports = app;
