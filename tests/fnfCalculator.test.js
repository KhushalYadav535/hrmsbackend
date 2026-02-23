const {
  calculateGratuity,
  calculateLeaveEncashment,
  calculateNoticePeriodRecovery,
  calculatePartialMonthSalary,
  calculateServiceYears,
  calculateFullAndFinal,
} = require('../utils/fnfCalculator');

describe('F&F Calculator Unit Tests', () => {
  describe('calculateGratuity', () => {
    test('should return 0 for service less than 5 years', () => {
      const result = calculateGratuity(50000, 10000, 3.5);
      expect(result.gratuityAmount).toBe(0);
      expect(result.isEligible).toBe(false);
    });

    test('should calculate gratuity for exactly 5 years', () => {
      const basic = 50000;
      const da = 10000;
      const years = 5;
      const result = calculateGratuity(basic, da, years);
      
      // Gratuity = (50000 + 10000) × 15/26 × 5 = 60000 × 0.5769 × 5 = 173076.92
      expect(result.gratuityAmount).toBeGreaterThan(0);
      expect(result.isEligible).toBe(true);
      expect(result.gratuityYears).toBe(5);
    });

    test('should apply ₹20L cap for high gratuity', () => {
      const basic = 200000;
      const da = 50000;
      const years = 25;
      const result = calculateGratuity(basic, da, years);
      
      expect(result.gratuityAmount).toBeLessThanOrEqual(2000000);
      expect(result.gratuityAmount).toBe(2000000); // Should hit cap
    });

    test('should round up years if remaining days >= 240', () => {
      // 5 years + 240 days = should round to 6
      const years = 5 + (240 / 365.25); // ~5.657 years
      const serviceDays = (5 * 365) + 240; // 5 years * 365 + 240 days = 2065 days
      const result = calculateGratuity(50000, 10000, years, serviceDays);
      expect(result.gratuityYears).toBe(6);
    });

    test('should round down years if remaining days < 240', () => {
      // 5 years + 200 days = 5.548 years, should round to 5
      const years = 5 + (200 / 365.25); // ~5.548 years
      const result = calculateGratuity(50000, 10000, years);
      expect(result.gratuityYears).toBe(5);
    });
  });

  describe('calculateLeaveEncashment', () => {
    test('should calculate leave encashment correctly', () => {
      const basic = 50000;
      const da = 10000;
      const plBalance = 20;
      const clBalance = 10;
      const result = calculateLeaveEncashment(basic, da, plBalance, clBalance);

      // Total leave = 30 days
      // Per day = (50000 + 10000) / 26 = 2307.69
      // Encashment = 2307.69 × 30 = 69230.77
      expect(result.leaveEncashmentDays).toBe(30);
      expect(result.leaveEncashmentAmount).toBeGreaterThan(69000);
      expect(result.leaveEncashmentAmount).toBeLessThan(70000);
    });

    test('should cap at max encashable days (30)', () => {
      const basic = 50000;
      const da = 10000;
      const plBalance = 50; // More than 30
      const clBalance = 20;
      const result = calculateLeaveEncashment(basic, da, plBalance, clBalance);

      expect(result.leaveEncashmentDays).toBe(30);
    });

    test('should handle zero leave balance', () => {
      const result = calculateLeaveEncashment(50000, 10000, 0, 0);
      expect(result.leaveEncashmentDays).toBe(0);
      expect(result.leaveEncashmentAmount).toBe(0);
    });

    test('should allow custom max encashable days', () => {
      const result = calculateLeaveEncashment(50000, 10000, 40, 10, 25);
      expect(result.leaveEncashmentDays).toBe(25);
    });
  });

  describe('calculateNoticePeriodRecovery', () => {
    test('should return 0 if notice period waived', () => {
      const result = calculateNoticePeriodRecovery(100000, 60, 30, true);
      expect(result.recoveryDays).toBe(0);
      expect(result.recoveryAmount).toBe(0);
    });

    test('should return 0 if full notice served', () => {
      const result = calculateNoticePeriodRecovery(100000, 60, 60, false);
      expect(result.recoveryDays).toBe(0);
      expect(result.recoveryAmount).toBe(0);
    });

    test('should calculate recovery for shortfall', () => {
      const gross = 90000; // ₹90,000 per month
      const required = 60;
      const actual = 30;
      const result = calculateNoticePeriodRecovery(gross, required, actual, false);

      // Shortfall = 30 days
      // Per day = 90000 / 30 = 3000
      // Recovery = 3000 × 30 = 90000
      expect(result.recoveryDays).toBe(30);
      expect(result.recoveryAmount).toBe(90000);
    });

    test('should handle negative shortfall (over-served)', () => {
      const result = calculateNoticePeriodRecovery(100000, 60, 90, false);
      expect(result.recoveryDays).toBe(0);
      expect(result.recoveryAmount).toBe(0);
    });
  });

  describe('calculatePartialMonthSalary', () => {
    test('should calculate partial month salary correctly', () => {
      const gross = 78000; // ₹78,000 per month
      const daysWorked = 15;
      const result = calculatePartialMonthSalary(gross, daysWorked);

      // Per day = 78000 / 26 = 3000
      // Salary = 3000 × 15 = 45000
      expect(result.salaryAmount).toBe(45000);
    });

    test('should handle full month (26 working days)', () => {
      const gross = 78000;
      const result = calculatePartialMonthSalary(gross, 26);
      expect(result.salaryAmount).toBe(78000);
    });

    test('should handle single day', () => {
      const gross = 78000;
      const result = calculatePartialMonthSalary(gross, 1);
      expect(result.salaryAmount).toBe(3000); // 78000 / 26 = 3000
    });
  });

  describe('calculateServiceYears', () => {
    test('should calculate service years correctly', () => {
      const joiningDate = new Date('2020-01-01');
      const lastWorkingDate = new Date('2025-01-01');
      const result = calculateServiceYears(joiningDate, lastWorkingDate);

      expect(result.serviceYears).toBeCloseTo(5, 1);
      expect(result.fullYears).toBe(5);
    });

    test('should handle leap years', () => {
      const joiningDate = new Date('2020-01-01');
      const lastWorkingDate = new Date('2024-12-31');
      const result = calculateServiceYears(joiningDate, lastWorkingDate);

      // Should account for leap year (2020)
      expect(result.serviceYears).toBeCloseTo(4.99, 1);
    });

    test('should calculate remaining days', () => {
      const joiningDate = new Date('2020-01-01');
      const lastWorkingDate = new Date('2025-06-15');
      const result = calculateServiceYears(joiningDate, lastWorkingDate);

      expect(result.fullYears).toBe(5);
      expect(result.remainingDays).toBeGreaterThan(0);
    });
  });

  describe('calculateFullAndFinal', () => {
    test('should calculate complete F&F settlement', () => {
      const employeeData = {
        basicSalary: 50000,
        daAmount: 10000,
        grossSalary: 90000,
        joiningDate: new Date('2020-01-01'),
        plBalance: 20,
        clBalance: 10,
      };

      const separationData = {
        lastWorkingDate: new Date('2025-01-15'),
        resignationDate: new Date('2024-12-15'),
        noticePeriodDays: 60,
        noticePeriodServedDays: 30,
        noticePeriodWaived: false,
        lastSalaryMonth: 1,
        lastSalaryYear: 2025,
      };

      const financialData = {
        loanOutstanding: 50000,
        advanceOutstanding: 10000,
        bonusAmount: 20000,
        pfContribution: 0,
      };

      const result = calculateFullAndFinal(employeeData, separationData, financialData);

      // Verify all components are present
      expect(result).toHaveProperty('salaryAmount');
      expect(result).toHaveProperty('leaveEncashmentAmount');
      expect(result).toHaveProperty('gratuityAmount');
      expect(result).toHaveProperty('totalEarnings');
      expect(result).toHaveProperty('totalDeductions');
      expect(result).toHaveProperty('netPayable');

      // Verify calculations
      expect(result.totalEarnings).toBeGreaterThan(0);
      expect(result.totalDeductions).toBeGreaterThan(0);
      expect(result.netPayable).toBe(result.totalEarnings - result.totalDeductions);
    });

    test('should handle zero loan outstanding', () => {
      const employeeData = {
        basicSalary: 50000,
        daAmount: 10000,
        grossSalary: 90000,
        joiningDate: new Date('2020-01-01'),
        plBalance: 10,
        clBalance: 5,
      };

      const separationData = {
        lastWorkingDate: new Date('2025-01-15'),
        resignationDate: new Date('2024-12-15'),
        noticePeriodDays: 60,
        noticePeriodServedDays: 60,
        noticePeriodWaived: false,
        lastSalaryMonth: 1,
        lastSalaryYear: 2025,
      };

      const financialData = {
        loanOutstanding: 0,
        advanceOutstanding: 0,
        bonusAmount: 0,
        pfContribution: 0,
      };

      const result = calculateFullAndFinal(employeeData, separationData, financialData);

      expect(result.loanOutstandingRecovery).toBe(0);
      expect(result.advanceRecovery).toBe(0);
      expect(result.noticePeriodRecoveryAmount).toBe(0);
    });

    test('should handle notice period waived', () => {
      const employeeData = {
        basicSalary: 50000,
        daAmount: 10000,
        grossSalary: 90000,
        joiningDate: new Date('2020-01-01'),
        plBalance: 10,
        clBalance: 5,
      };

      const separationData = {
        lastWorkingDate: new Date('2025-01-15'),
        resignationDate: new Date('2024-12-15'),
        noticePeriodDays: 60,
        noticePeriodServedDays: 30,
        noticePeriodWaived: true, // Waived
        lastSalaryMonth: 1,
        lastSalaryYear: 2025,
      };

      const result = calculateFullAndFinal(employeeData, separationData, {});

      expect(result.noticePeriodRecoveryAmount).toBe(0);
    });
  });
});
