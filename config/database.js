const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // VPS MongoDB connection string
    // VPS IP: 213.210.37.237
    // External Port: 32768 (maps to internal port 27017)
    // Note: Check actual port with: docker ps | grep mongodb-4-o5bk-mongodb4-1
    
    // VPS MongoDB requires authentication for operations
    // First try with authentication (after running setup-mongo-user script)
    const defaultURI = 'mongodb://admin:vJUm4yLOD8eUZsBqtdGJYU47JsJFe8rO@213.210.37.237:32768/hrms?authSource=admin';
    
    // If authentication fails, try without auth (for initial setup):
    // const defaultURI = 'mongodb://213.210.37.237:32768/hrms';
    
    // Use environment variable if set, otherwise use default
    const mongoURI = process.env.VPS_MONGODB_URI || 
                     process.env.MONGODB_URI || 
                     defaultURI;
    
    console.log(`Connecting to MongoDB: ${mongoURI.replace(/:[^:@]+@/, ':****@')}`);
    
    const conn = await mongoose.connect(mongoURI, {
      serverSelectionTimeoutMS: 30000, // 30 seconds timeout for remote connections
      socketTimeoutMS: 45000, // 45 seconds socket timeout
      connectTimeoutMS: 30000, // 30 seconds connection timeout
      maxPoolSize: 10, // Maximum number of connections in the pool
      minPoolSize: 2, // Minimum number of connections in the pool
      retryWrites: true, // Retry writes on network errors
      retryReads: true, // Retry reads on network errors
      heartbeatFrequencyMS: 10000, // Heartbeat frequency
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    console.log(`✅ Database: ${conn.connection.name}`);
  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    
    // If authentication fails, suggest trying without authSource
    if (error.message.includes('Authentication failed') || error.message.includes('auth')) {
      console.error('\n💡 Authentication failed. Try these fixes:');
      console.error('\nFix 1: Remove authSource from connection string');
      console.error('   Update .env: MONGODB_URI=mongodb://admin:vJUm4yLOD8eUZsBqtdGJYU47JsJFe8rO@213.210.37.237:32768/hrms');
      console.error('\nFix 2: Try with authSource=admin');
      console.error('   Update .env: MONGODB_URI=mongodb://admin:vJUm4yLOD8eUZsBqtdGJYU47JsJFe8rO@213.210.37.237:32768/hrms?authSource=admin');
      console.error('\nFix 3: Run detailed test to find working connection:');
      console.error('   npm run test-vps-detailed');
    } else {
      console.error('\nTroubleshooting:');
      console.error('1. Verify username/password are correct');
      console.error('2. Check if authSource is correct (try "admin" or remove authSource)');
      console.error('3. Verify database name is correct');
      console.error('4. Check if user has access to the database');
      console.error('5. Run: npm run test-vps-detailed (to test different connection strings)');
    }
    
    console.error('\n💡 Tip: Set MONGODB_URI in .env file with working connection string');
    process.exit(1);
  }
};

module.exports = connectDB;
