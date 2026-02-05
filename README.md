# HRMS Backend API

Complete backend API for HRMS system with multi-tenant support and full CRUD operations.

## Features

- ✅ Multi-tenant architecture
- ✅ JWT Authentication & Authorization
- ✅ Role-based access control (RBAC)
- ✅ Complete CRUD operations for all modules
- ✅ MongoDB with Mongoose
- ✅ Express.js REST API
- ✅ Error handling middleware
- ✅ Data validation

## Installation

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file from `.env.example`:
```bash
cp .env.example .env
```

3. Update `.env` with your configuration:
```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/hrms
JWT_SECRET=your-super-secret-jwt-key
CORS_ORIGIN=http://localhost:3000
```

4. Start MongoDB (if running locally):
```bash
mongod
```

5. Run the server:
```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/register-tenant` - Register new tenant
- `GET /api/auth/me` - Get current user (Protected)

### Employees
- `GET /api/employees` - Get all employees
- `GET /api/employees/:id` - Get single employee
- `POST /api/employees` - Create employee (HR Admin, Tenant Admin)
- `PUT /api/employees/:id` - Update employee (HR Admin, Tenant Admin)
- `DELETE /api/employees/:id` - Delete employee (HR Admin, Tenant Admin)

### Payroll
- `GET /api/payroll` - Get all payroll records
- `GET /api/payroll/:id` - Get single payroll record
- `POST /api/payroll` - Create payroll (Payroll Admin, HR Admin)
- `PUT /api/payroll/:id` - Update payroll (Payroll Admin, HR Admin)
- `DELETE /api/payroll/:id` - Delete payroll (Payroll Admin)

### Leave Requests
- `GET /api/leaves` - Get all leave requests
- `GET /api/leaves/:id` - Get single leave request
- `POST /api/leaves` - Create leave request
- `PUT /api/leaves/:id` - Update leave request
- `PUT /api/leaves/:id/approve` - Approve/Reject leave (Manager, HR Admin)
- `DELETE /api/leaves/:id` - Delete leave request

### Expenses
- `GET /api/expenses` - Get all expenses
- `GET /api/expenses/:id` - Get single expense
- `POST /api/expenses` - Create expense
- `PUT /api/expenses/:id` - Update expense
- `PUT /api/expenses/:id/approve` - Approve/Reject expense (Manager, HR Admin, Finance Admin)
- `DELETE /api/expenses/:id` - Delete expense

### Jobs (Recruitment)
- `GET /api/jobs` - Get all jobs
- `GET /api/jobs/:id` - Get single job
- `POST /api/jobs` - Create job (HR Admin, Tenant Admin)
- `PUT /api/jobs/:id` - Update job (HR Admin, Tenant Admin)
- `DELETE /api/jobs/:id` - Delete job (HR Admin, Tenant Admin)

### Departments
- `GET /api/departments` - Get all departments
- `GET /api/departments/:id` - Get single department
- `POST /api/departments` - Create department (HR Admin, Tenant Admin, System Admin)
- `PUT /api/departments/:id` - Update department (HR Admin, Tenant Admin, System Admin)
- `DELETE /api/departments/:id` - Delete department (HR Admin, Tenant Admin, System Admin)

### Bonuses
- `GET /api/bonuses` - Get all bonuses
- `GET /api/bonuses/:id` - Get single bonus
- `POST /api/bonuses` - Create bonus (Payroll Admin, HR Admin, Tenant Admin)
- `PUT /api/bonuses/:id` - Update bonus (Payroll Admin, HR Admin, Tenant Admin)
- `PUT /api/bonuses/:id/process` - Process bonus (Payroll Admin)
- `DELETE /api/bonuses/:id` - Delete bonus (Payroll Admin, HR Admin, Tenant Admin)

## Authentication

All protected routes require a JWT token in the Authorization header:

```
Authorization: Bearer <token>
```

## Multi-Tenant Support

The system automatically filters all data by tenant. Each user belongs to a tenant, and all queries are scoped to that tenant.

Super Admin users can access data across all tenants by providing `tenantId` in query parameters.

## Role-Based Access Control

- **Super Admin**: Full access to all tenants
- **Tenant Admin**: Full access within their tenant
- **HR Administrator**: HR operations within tenant
- **Payroll Administrator**: Payroll operations
- **Finance Administrator**: Financial approvals
- **System Administrator**: System configuration
- **Manager**: Team management and approvals
- **Employee**: Self-service access
- **Auditor**: Read-only access

## Database Models

- Tenant
- User
- Employee
- Payroll
- LeaveRequest
- Expense
- Job
- Department
- Bonus

## Error Handling

All errors are handled by the error handler middleware and return consistent JSON responses:

```json
{
  "success": false,
  "message": "Error message"
}
```

## Development

The server runs on `http://localhost:5000` by default.

Use `npm run dev` for development with auto-reload (requires nodemon).
