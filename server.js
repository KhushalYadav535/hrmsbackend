const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./config/database');
const errorHandler = require('./middleware/errorHandler');

// Load env vars
dotenv.config();

// Connect to database
connectDB();

const app = express();

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// CORS - Allow multiple origins (Vercel frontend + localhost for development)
const allowedOrigins = process.env.CORS_ORIGIN 
  ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim())
  : ['http://localhost:3000', 'https://hrmssystem.vercel.app'];

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      
      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(null, true); // Allow all origins for now (can restrict later)
      }
    },
    credentials: true,
  })
);

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/tenants', require('./routes/tenants'));
app.use('/api/users', require('./routes/users'));
app.use('/api/employees', require('./routes/employees'));
app.use('/api/payroll', require('./routes/payroll'));
app.use('/api/leaves', require('./routes/leaves'));
app.use('/api/loans', require('./routes/loans'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/jobs', require('./routes/jobs'));
app.use('/api/departments', require('./routes/departments'));
app.use('/api/designations', require('./routes/designations'));
app.use('/api/role-permissions', require('./routes/rolePermissions'));
app.use('/api/audit-logs', require('./routes/auditLogs'));
app.use('/api/bonuses', require('./routes/bonuses'));
app.use('/api/tax-declarations', require('./routes/tax'));
app.use('/api/tax', require('./routes/tax'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/leave-policies', require('./routes/leavePolicies'));
app.use('/api/system', require('./routes/system'));
app.use('/api/performance', require('./routes/performance'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/onboarding', require('./routes/onboarding'));
app.use('/api/salary-structures', require('./routes/salaryStructures'));
app.use('/api/one-time-payments', require('./routes/oneTimePayments'));
app.use('/api/exit-settlements', require('./routes/exitSettlements'));
app.use('/api/family-members', require('./routes/familyMembers'));
app.use('/api/nominees', require('./routes/nominees'));
app.use('/api/posting-history', require('./routes/postingHistory'));
app.use('/api/skills', require('./routes/skills'));
app.use('/api/training-history', require('./routes/trainingHistory'));
app.use('/api/career-planning', require('./routes/careerPlanning'));
app.use('/api/holiday-calendar', require('./routes/holidayCalendar'));
app.use('/api/leave-encashment', require('./routes/leaveEncashment'));
app.use('/api/travel', require('./routes/travel'));
app.use('/api/appraisal', require('./routes/appraisal'));
app.use('/api/delegations', require('./routes/delegation'));
app.use('/api/access-certification', require('./routes/accessCertification'));
app.use('/api/ldap', require('./routes/ldap'));

// Health check
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'HRMS API is running',
    timestamp: new Date().toISOString(),
  });
});

// Error handler (must be last)
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});
