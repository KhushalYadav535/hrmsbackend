/**
 * Unit Tests for EMI Calculation Utility
 * Tests EMI formula with various sample values
 */

const { calculateEMI, calculateEMIWithDates } = require('../utils/emiCalculator');

describe('EMI Calculator', () => {
  describe('calculateEMI - Basic Calculations', () => {
    test('should calculate EMI for Festival Advance (₹25,000, 0%, 10 months)', () => {
      const result = calculateEMI(25000, 0, 10);
      
      expect(result.emiAmount).toBe(2500); // 25000 / 10
      expect(result.totalAmount).toBe(25000);
      expect(result.totalInterest).toBe(0);
      expect(result.schedule).toHaveLength(10);
      expect(result.schedule[0].principalAmount).toBe(2500);
      expect(result.schedule[0].interestAmount).toBe(0);
      expect(result.schedule[9].outstandingPrincipal).toBe(0);
    });

    test('should calculate EMI for House Building Loan (₹50,00,000, 7.5%, 240 months)', () => {
      const result = calculateEMI(5000000, 7.5, 240);
      
      // Expected EMI approximately ₹40,000-41,000
      expect(result.emiAmount).toBeGreaterThan(40000);
      expect(result.emiAmount).toBeLessThan(41000);
      
      // Total amount should be EMI × 240
      expect(result.totalAmount).toBeCloseTo(result.emiAmount * 240, 0);
      
      // Total interest should be positive
      expect(result.totalInterest).toBeGreaterThan(0);
      
      // Schedule should have 240 entries
      expect(result.schedule).toHaveLength(240);
      
      // First EMI should have higher interest component
      expect(result.schedule[0].interestAmount).toBeGreaterThan(result.schedule[0].principalAmount);
      
      // Last EMI should have higher principal component
      const lastEMI = result.schedule[239];
      expect(lastEMI.principalAmount).toBeGreaterThan(lastEMI.interestAmount);
      
      // Outstanding principal should be 0 after last EMI
      expect(lastEMI.outstandingPrincipal).toBe(0);
    });

    test('should calculate EMI for Vehicle Loan (₹10,00,000, 8.0%, 84 months)', () => {
      const result = calculateEMI(1000000, 8.0, 84);
      
      // Expected EMI approximately ₹15,000-16,000
      expect(result.emiAmount).toBeGreaterThan(15000);
      expect(result.emiAmount).toBeLessThan(16000);
      
      expect(result.schedule).toHaveLength(84);
      expect(result.totalAmount).toBeCloseTo(result.emiAmount * 84, 0);
      expect(result.totalInterest).toBeGreaterThan(0);
    });

    test('should calculate EMI for Personal Loan (₹5,00,000, 10.0%, 60 months)', () => {
      const result = calculateEMI(500000, 10.0, 60);
      
      // Expected EMI approximately ₹10,600-10,700
      expect(result.emiAmount).toBeGreaterThan(10600);
      expect(result.emiAmount).toBeLessThan(10700);
      
      expect(result.schedule).toHaveLength(60);
      expect(result.totalAmount).toBeCloseTo(result.emiAmount * 60, 0);
    });

    test('should calculate EMI for Education Loan (₹10,00,000, 7.0%, 120 months)', () => {
      const result = calculateEMI(1000000, 7.0, 120);
      
      // Expected EMI approximately ₹11,600-11,700
      expect(result.emiAmount).toBeGreaterThan(11600);
      expect(result.emiAmount).toBeLessThan(11700);
      
      expect(result.schedule).toHaveLength(120);
    });

    test('should calculate EMI for Computer Advance (₹50,000, 0%, 12 months)', () => {
      const result = calculateEMI(50000, 0, 12);
      
      expect(result.emiAmount).toBe(4167); // 50000 / 12 rounded
      // For zero interest, totalAmount may have small rounding differences
      expect(result.totalAmount).toBeGreaterThanOrEqual(50000);
      expect(result.totalAmount).toBeLessThanOrEqual(50004);
      // Total interest should be minimal (rounding differences only)
      expect(result.totalInterest).toBeGreaterThanOrEqual(0);
      expect(result.totalInterest).toBeLessThanOrEqual(4);
      expect(result.schedule).toHaveLength(12);
    });
  });

  describe('calculateEMI - Edge Cases', () => {
    test('should handle 1 month tenure', () => {
      const result = calculateEMI(100000, 10, 1);
      
      expect(result.emiAmount).toBeGreaterThan(100000);
      expect(result.schedule).toHaveLength(1);
      expect(result.schedule[0].outstandingPrincipal).toBe(0);
    });

    test('should handle very high interest rate', () => {
      const result = calculateEMI(100000, 24, 12);
      
      expect(result.emiAmount).toBeGreaterThan(9000);
      expect(result.totalInterest).toBeGreaterThan(result.totalAmount * 0.1); // >10% interest
    });

    test('should handle very low interest rate', () => {
      const result = calculateEMI(100000, 0.5, 12);
      
      expect(result.emiAmount).toBeGreaterThan(8000);
      expect(result.totalInterest).toBeLessThan(500);
    });

    test('should throw error for zero principal', () => {
      expect(() => calculateEMI(0, 10, 12)).toThrow('Principal amount must be greater than 0');
    });

    test('should throw error for negative principal', () => {
      expect(() => calculateEMI(-1000, 10, 12)).toThrow('Principal amount must be greater than 0');
    });

    test('should throw error for invalid tenure', () => {
      expect(() => calculateEMI(100000, 10, 0)).toThrow('Tenure must be a positive integer');
      expect(() => calculateEMI(100000, 10, -5)).toThrow('Tenure must be a positive integer');
      expect(() => calculateEMI(100000, 10, 12.5)).toThrow('Tenure must be a positive integer');
    });

    test('should throw error for invalid interest rate', () => {
      expect(() => calculateEMI(100000, -5, 12)).toThrow('Interest rate must be between 0 and 100');
      expect(() => calculateEMI(100000, 150, 12)).toThrow('Interest rate must be between 0 and 100');
    });
  });

  describe('calculateEMI - Schedule Validation', () => {
    test('should have correct EMI number sequence', () => {
      const result = calculateEMI(100000, 10, 12);
      
      result.schedule.forEach((emi, index) => {
        expect(emi.emiNumber).toBe(index + 1);
      });
    });

    test('should have principal + interest = EMI for each installment', () => {
      const result = calculateEMI(100000, 10, 12);
      
      result.schedule.forEach(emi => {
        const sum = emi.principalAmount + emi.interestAmount;
        // Allow for small rounding differences (within 0.02 due to floating point precision)
        expect(Math.abs(sum - emi.emiAmount)).toBeLessThanOrEqual(0.02);
      });
    });

    test('should have decreasing interest component over time', () => {
      const result = calculateEMI(100000, 10, 12);
      
      for (let i = 1; i < result.schedule.length; i++) {
        expect(result.schedule[i].interestAmount).toBeLessThanOrEqual(
          result.schedule[i - 1].interestAmount
        );
      }
    });

    test('should have increasing principal component over time', () => {
      const result = calculateEMI(100000, 10, 12);
      
      for (let i = 1; i < result.schedule.length; i++) {
        expect(result.schedule[i].principalAmount).toBeGreaterThanOrEqual(
          result.schedule[i - 1].principalAmount
        );
      }
    });

    test('should have outstanding principal decreasing to zero', () => {
      const result = calculateEMI(100000, 10, 12);
      
      expect(result.schedule[0].outstandingPrincipal).toBeLessThan(100000);
      expect(result.schedule[result.schedule.length - 1].outstandingPrincipal).toBe(0);
      
      // Outstanding should decrease monotonically
      for (let i = 1; i < result.schedule.length; i++) {
        expect(result.schedule[i].outstandingPrincipal).toBeLessThanOrEqual(
          result.schedule[i - 1].outstandingPrincipal
        );
      }
    });
  });

  describe('calculateEMIWithDates', () => {
    test('should add due dates to schedule', () => {
      const startDate = new Date('2026-02-01');
      const result = calculateEMIWithDates(100000, 10, 12, startDate);
      
      expect(result.schedule).toHaveLength(12);
      expect(result.schedule[0].dueDate).toBeInstanceOf(Date);
      expect(result.schedule[0].dueDate.getTime()).toBe(startDate.getTime());
      
      // Check that dates increment by month
      for (let i = 1; i < result.schedule.length; i++) {
        const prevDate = result.schedule[i - 1].dueDate;
        const currentDate = result.schedule[i].dueDate;
        const diffMonths = (currentDate.getFullYear() - prevDate.getFullYear()) * 12 +
                          (currentDate.getMonth() - prevDate.getMonth());
        expect(diffMonths).toBe(1);
      }
    });
  });

  describe('Real-world Examples', () => {
    test('Example 1: ₹5L loan at 12% for 5 years', () => {
      const result = calculateEMI(500000, 12, 60);
      
      // Expected EMI approximately ₹11,100-11,200
      expect(result.emiAmount).toBeGreaterThan(11100);
      expect(result.emiAmount).toBeLessThan(11200);
      
      // Verify total
      const totalFromSchedule = result.schedule.reduce((sum, emi) => sum + emi.emiAmount, 0);
      expect(totalFromSchedule).toBeCloseTo(result.totalAmount, 0);
    });

    test('Example 2: ₹20L loan at 8.5% for 20 years', () => {
      const result = calculateEMI(2000000, 8.5, 240);
      
      // Expected EMI approximately ₹17,300-17,400
      expect(result.emiAmount).toBeGreaterThan(17300);
      expect(result.emiAmount).toBeLessThan(17400);
      
      expect(result.schedule).toHaveLength(240);
    });
  });
});
