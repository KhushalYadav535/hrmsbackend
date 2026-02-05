const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../models/User');
const Tenant = require('../models/Tenant');

// Load env vars
dotenv.config();

// Connect to database
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms');
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

// Seed demo users
const seedDemoUsers = async () => {
  try {
    await connectDB();

    // Create or get main tenant
    let tenant = await Tenant.findOne({ code: 'INDBNK-HO' });
    if (!tenant) {
      tenant = new Tenant({
        name: 'Indian Bank - Head Office',
        code: 'INDBNK-HO',
        location: 'Chennai, India',
        status: 'active',
        employees: 0,
      });
      await tenant.save();
      console.log('✅ Created tenant: Indian Bank - Head Office');
    } else {
      console.log('✅ Using existing tenant: Indian Bank - Head Office');
    }

    // Create or get super admin tenant (for Super Admin user)
    let superTenant = await Tenant.findOne({ code: 'SUPER-TENANT' });
    if (!superTenant) {
      superTenant = new Tenant({
        name: 'Super Admin Tenant',
        code: 'SUPER-TENANT',
        location: 'System',
        status: 'active',
        employees: 0,
      });
      await superTenant.save();
      console.log('✅ Created super admin tenant');
    }

    // Demo users data
    const demoUsers = [
      {
        email: 'superadmin@indianbank.com',
        password: 'admin123',
        name: 'Super Admin',
        role: 'Super Admin',
        tenantId: superTenant._id,
        designation: 'Super Administrator',
        department: 'IT',
        status: 'active',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=SuperAdmin',
      },
      {
        email: 'ceo@indianbank.com',
        password: 'admin123',
        name: 'Rajesh Mehta',
        role: 'Tenant Admin',
        tenantId: tenant._id,
        designation: 'CEO & Managing Director',
        department: 'Executive',
        status: 'active',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=CEO',
      },
      {
        email: 'admin.hr@indianbank.com',
        password: 'password123',
        name: 'Priya Sharma',
        role: 'HR Administrator',
        tenantId: tenant._id,
        designation: 'HR Manager',
        department: 'HR',
        status: 'active',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Priya',
      },
      {
        email: 'payroll@indianbank.com',
        password: 'password123',
        name: 'Amit Kumar',
        role: 'Payroll Administrator',
        tenantId: tenant._id,
        designation: 'Payroll Manager',
        department: 'Finance',
        status: 'active',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Amit',
      },
      {
        email: 'finance@indianbank.com',
        password: 'password123',
        name: 'Vikram Singh',
        role: 'Finance Administrator',
        tenantId: tenant._id,
        designation: 'CFO',
        department: 'Finance',
        status: 'active',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Vikram',
      },
      {
        email: 'priya.sharma@indianbank.com',
        password: 'password123',
        name: 'Priya Sharma',
        role: 'Manager',
        tenantId: tenant._id,
        designation: 'Department Manager',
        department: 'Operations',
        status: 'active',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=PriyaManager',
      },
      {
        email: 'rajesh.kumar@indianbank.com',
        password: 'password123',
        name: 'Rajesh Kumar',
        role: 'Employee',
        tenantId: tenant._id,
        designation: 'Software Engineer',
        department: 'IT',
        status: 'active',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Rajesh',
      },
      {
        email: 'auditor@indianbank.com',
        password: 'password123',
        name: 'Anjali Desai',
        role: 'Auditor',
        tenantId: tenant._id,
        designation: 'Internal Auditor',
        department: 'Audit',
        status: 'active',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Anjali',
      },
    ];

    // Create or update users
    let createdCount = 0;
    let updatedCount = 0;

    for (const userData of demoUsers) {
      const existingUser = await User.findOne({ 
        email: userData.email,
        tenantId: userData.tenantId 
      });

      if (existingUser) {
        // Update existing user (including password reset)
        existingUser.password = userData.password; // Will be hashed by pre-save hook
        existingUser.name = userData.name;
        existingUser.role = userData.role;
        existingUser.designation = userData.designation;
        existingUser.department = userData.department;
        existingUser.status = userData.status;
        existingUser.avatar = userData.avatar;
        await existingUser.save();
        updatedCount++;
        console.log(`🔄 Updated user: ${userData.email}`);
      } else {
        // Create new user
        await User.create(userData);
        createdCount++;
        console.log(`✅ Created user: ${userData.email} (${userData.role})`);
      }
    }

    console.log('\n📊 Summary:');
    console.log(`   Created: ${createdCount} users`);
    console.log(`   Updated: ${updatedCount} users`);
    console.log(`   Total: ${demoUsers.length} users`);
    console.log('\n✅ Demo users seeded successfully!');
    console.log('\n📝 Login Credentials:');
    console.log('   🔐 Super Admin: superadmin@indianbank.com / admin123');
    console.log('   👑 Tenant Admin (CEO): ceo@indianbank.com / admin123');
    console.log('   👨‍💼 HR Administrator: admin.hr@indianbank.com / password123');
    console.log('   💰 Payroll Administrator: payroll@indianbank.com / password123');
    console.log('   💵 Finance Administrator: finance@indianbank.com / password123');
    console.log('   👔 Manager: priya.sharma@indianbank.com / password123');
    console.log('   👤 Employee: rajesh.kumar@indianbank.com / password123');
    console.log('   🔍 Auditor: auditor@indianbank.com / password123');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding users:', error);
    process.exit(1);
  }
};

// Run seed
seedDemoUsers();
