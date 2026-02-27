const mongoose = require('mongoose');
const dotenv = require('dotenv');
const HolidayCalendar = require('./models/HolidayCalendar');

dotenv.config();

async function cleanHolidays() {
    try {
        await mongoose.connect(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 5000,
        });
        console.log('Connected to DB');

        // Find all calendars
        const calendars = await HolidayCalendar.find({});
        console.log(`Found ${calendars.length} calendars`);

        let removedCount = 0;

        for (const calendar of calendars) {
            if (!calendar.holidays) continue;

            const initialCount = calendar.holidays.length;
            calendar.holidays = calendar.holidays.filter(h => {
                const name = (h.name || '').toLowerCase();
                return !name.includes('test') && !name.includes('business');
            });

            if (calendar.holidays.length < initialCount) {
                removedCount += (initialCount - calendar.holidays.length);
                await calendar.save();
            }
        }

        console.log(`Successfully removed ${removedCount} test/business holidays.`);
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

cleanHolidays();
