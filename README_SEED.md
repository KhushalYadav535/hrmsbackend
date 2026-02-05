# Seed Demo Users - Setup Guide

## Quick Start

Run the seed script to populate MongoDB with demo users for testing:

```bash
npm run seed
```

Or directly:

```bash
node scripts/seedDemoUsers.js
```

## Prerequisites

1. **MongoDB must be running** on your local machine (default: `mongodb://localhost:27017`)
2. **Environment variables** should be set (optional, defaults provided)

## What the Script Does

1. Creates a tenant: **Indian Bank - Head Office** (code: `INDBNK-HO`)
2. Creates a super admin tenant: **Super Admin Tenant** (code: `SUPER-TENANT`)
3. Creates/updates 9 demo users with different roles:

### Demo Users Created:

| Email | Password | Role | Tenant |
|-------|----------|------|--------|
| superadmin@indianbank.com | admin123 | Super Admin | SUPER-TENANT |
| ceo@indianbank.com | admin123 | Tenant Admin | INDBNK-HO |
| admin.hr@indianbank.com | password123 | HR Administrator | INDBNK-HO |
| payroll@indianbank.com | password123 | Payroll Administrator | INDBNK-HO |
| finance@indianbank.com | password123 | Finance Administrator | INDBNK-HO |
| system@indianbank.com | password123 | System Administrator | INDBNK-HO |
| priya.sharma@indianbank.com | password123 | Manager | INDBNK-HO |
| rajesh.kumar@indianbank.com | password123 | Employee | INDBNK-HO |
| auditor@indianbank.com | password123 | Auditor | INDBNK-HO |

## Features

- ✅ **Idempotent**: Can run multiple times safely
- ✅ **Updates existing users**: If user exists, updates password and details
- ✅ **Auto-hashes passwords**: Passwords are automatically hashed using bcrypt
- ✅ **Creates tenants**: Automatically creates required tenants if they don't exist

## Environment Variables

The script uses these environment variables (with defaults):

```env
MONGODB_URI=mongodb://localhost:27017/hrms
```

You can set this in a `.env` file or as an environment variable.

## Troubleshooting

### Error: Cannot connect to MongoDB
- Make sure MongoDB is running: `mongod` or MongoDB service is started
- Check connection string in `.env` file

### Error: User already exists
- This is normal! The script will update existing users
- Check the console output for details

### Error: E11000 duplicate key error
- This means there's a duplicate email+tenantId combination
- The script handles this by updating existing users
- If error persists, manually delete conflicting users from MongoDB

## Testing Login

After seeding, test login with any of the demo credentials:

```bash
# Example using curl
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"superadmin@indianbank.com","password":"admin123"}'
```

Or use the frontend login page at `http://localhost:3000/login`

## Notes

- Passwords are hashed using bcrypt (salt rounds: 10)
- All users are set to `active` status
- Join dates are set to current date
- Avatars use DiceBear API for consistent profile pictures
