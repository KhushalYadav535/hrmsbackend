/**
 * Unit Tests for Organization Unit Hierarchy Traversal
 * Tests hierarchy methods: getChildren, getDescendants, getHierarchyTree
 */

const mongoose = require('mongoose');
const OrganizationUnit = require('../models/OrganizationUnit');
const Tenant = require('../models/Tenant');
const connectDB = require('../config/database');

describe('OrganizationUnit Hierarchy Traversal', () => {
  let tenantId;
  let hoId, zo1Id, zo2Id, ro1Id, ro2Id, branch1Id, branch2Id;

  beforeAll(async () => {
    await connectDB();
  });

  beforeEach(async () => {
    // Generate unique timestamp for this test run
    const timestamp = Date.now();
    
    // Clean up existing units
    if (tenantId) {
      await OrganizationUnit.deleteMany({ tenantId });
    }
    
    // Create or get tenant for this test run
    if (!tenantId) {
      const tenant = await Tenant.create({
        name: 'Test Bank',
        email: `test-${timestamp}@bank.com`,
        phone: '1234567890',
        code: `TEST-BANK-${timestamp}`,
        location: 'Mumbai',
      });
      tenantId = tenant._id;
    }

    // Create test hierarchy with unique codes:
    // HO
    //   ├─ ZO1
    //   │   ├─ RO1
    //   │   │   ├─ Branch1
    //   │   │   └─ Branch2
    //   │   └─ RO2
    //   └─ ZO2

    const ho = await OrganizationUnit.create({
      tenantId,
      unitCode: `HO-${String(timestamp).slice(-3)}`,
      unitName: 'Head Office',
      unitType: 'HO',
      state: 'Maharashtra',
      city: 'Mumbai',
      isActive: true,
    });
    hoId = ho._id;

    const zo1 = await OrganizationUnit.create({
      tenantId,
      unitCode: `ZO-NORTH-${String(timestamp).slice(-2)}`,
      unitName: 'North Zone',
      unitType: 'ZO',
      parentUnitId: hoId,
      state: 'Delhi',
      city: 'New Delhi',
      isActive: true,
    });
    zo1Id = zo1._id;

    const zo2 = await OrganizationUnit.create({
      tenantId,
      unitCode: `ZO-SOUTH-${String(timestamp).slice(-2)}`,
      unitName: 'South Zone',
      unitType: 'ZO',
      parentUnitId: hoId,
      state: 'Tamil Nadu',
      city: 'Chennai',
      isActive: true,
    });
    zo2Id = zo2._id;

    const ro1 = await OrganizationUnit.create({
      tenantId,
      unitCode: `RO-DEL${String(timestamp).slice(-2)}`,
      unitName: 'Delhi Regional Office 1',
      unitType: 'RO',
      parentUnitId: zo1Id,
      state: 'Delhi',
      city: 'New Delhi',
      isActive: true,
    });
    ro1Id = ro1._id;

    const ro2 = await OrganizationUnit.create({
      tenantId,
      unitCode: `RO-DEL${String(timestamp).slice(-2)}2`,
      unitName: 'Delhi Regional Office 2',
      unitType: 'RO',
      parentUnitId: zo1Id,
      state: 'Delhi',
      city: 'New Delhi',
      isActive: true,
    });
    ro2Id = ro2._id;

    const branch1 = await OrganizationUnit.create({
      tenantId,
      unitCode: `BR-${String(timestamp).slice(-6).padStart(6, '0')}`,
      unitName: 'Delhi Branch 1',
      unitType: 'BRANCH',
      parentUnitId: ro1Id,
      state: 'Delhi',
      city: 'New Delhi',
      isActive: true,
    });
    branch1Id = branch1._id;

    const branch2 = await OrganizationUnit.create({
      tenantId,
      unitCode: `BR-${String(timestamp + 1).slice(-6).padStart(6, '0')}`,
      unitName: 'Delhi Branch 2',
      unitType: 'BRANCH',
      parentUnitId: ro1Id,
      state: 'Delhi',
      city: 'New Delhi',
      isActive: true,
    });
    branch2Id = branch2._id;
  });

  afterAll(async () => {
    // Clean up all test data
    if (tenantId) {
      await OrganizationUnit.deleteMany({ tenantId });
      await Tenant.deleteOne({ _id: tenantId });
    }
    await mongoose.connection.close();
  });

  describe('getChildren() method', () => {
    test('should return direct children of HO', async () => {
      const ho = await OrganizationUnit.findById(hoId);
      const children = await ho.getChildren();

      expect(children).toHaveLength(2);
      expect(children.every(c => c.unitType === 'ZO')).toBe(true);
    });

    test('should return direct children of ZO', async () => {
      const zo1 = await OrganizationUnit.findById(zo1Id);
      const children = await zo1.getChildren();

      expect(children).toHaveLength(2);
      expect(children.every(c => c.unitType === 'RO')).toBe(true);
    });

    test('should return direct children of RO', async () => {
      const ro1 = await OrganizationUnit.findById(ro1Id);
      const children = await ro1.getChildren();

      expect(children).toHaveLength(2);
      expect(children.every(c => c.unitType === 'BRANCH')).toBe(true);
    });

    test('should return empty array for leaf nodes', async () => {
      const branch1 = await OrganizationUnit.findById(branch1Id);
      const children = await branch1.getChildren();

      expect(children).toHaveLength(0);
    });
  });

  describe('getDescendants() method', () => {
    test('should return all descendants of HO (recursive)', async () => {
      const ho = await OrganizationUnit.findById(hoId);
      const descendants = await ho.getDescendants();

      expect(descendants).toHaveLength(6); // 2 ZOs + 2 ROs + 2 Branches
      // Check that we have the right types instead of exact codes (since codes are now unique)
      const types = descendants.map(d => d.unitType);
      expect(types.filter(t => t === 'ZO')).toHaveLength(2);
      expect(types.filter(t => t === 'RO')).toHaveLength(2);
      expect(types.filter(t => t === 'BRANCH')).toHaveLength(2);
    });

    test('should return all descendants of ZO (recursive)', async () => {
      const zo1 = await OrganizationUnit.findById(zo1Id);
      const descendants = await zo1.getDescendants();

      expect(descendants).toHaveLength(4); // 2 ROs + 2 Branches
      const types = descendants.map(d => d.unitType);
      expect(types.filter(t => t === 'RO')).toHaveLength(2);
      expect(types.filter(t => t === 'BRANCH')).toHaveLength(2);
    });

    test('should return all descendants of RO (recursive)', async () => {
      const ro1 = await OrganizationUnit.findById(ro1Id);
      const descendants = await ro1.getDescendants();

      expect(descendants).toHaveLength(2); // 2 Branches
      const types = descendants.map(d => d.unitType);
      expect(types.every(t => t === 'BRANCH')).toBe(true);
    });

    test('should return empty array for leaf nodes', async () => {
      const branch1 = await OrganizationUnit.findById(branch1Id);
      const descendants = await branch1.getDescendants();

      expect(descendants).toHaveLength(0);
    });
  });

  describe('getHierarchyTree() static method', () => {
    test('should return full hierarchy tree structure', async () => {
      const tree = await OrganizationUnit.getHierarchyTree(tenantId);

      expect(tree).toHaveLength(1); // One HO
      expect(tree[0].unitType).toBe('HO');
      expect(tree[0].children).toHaveLength(2); // Two ZOs

      const zo1 = tree[0].children.find(c => c.unitType === 'ZO');
      expect(zo1).toBeDefined();
      expect(zo1.children).toHaveLength(2); // Two ROs

      const ro1 = zo1.children.find(c => c.unitType === 'RO');
      expect(ro1).toBeDefined();
      expect(ro1.children).toHaveLength(2); // Two Branches
    });

    test('should only return active units', async () => {
      // Deactivate one branch
      await OrganizationUnit.updateOne(
        { _id: branch1Id },
        { isActive: false }
      );

      const tree = await OrganizationUnit.getHierarchyTree(tenantId);
      const zo1 = tree[0].children.find(c => c.unitType === 'ZO');
      const ro1 = zo1?.children.find(c => c.unitType === 'RO');

      expect(ro1?.children).toHaveLength(1); // Only active branch
      expect(ro1?.children[0].unitType).toBe('BRANCH');
    });

    test('should return empty array for tenant with no units', async () => {
      // Create another tenant with no units
      const emptyTenant = await Tenant.create({
        name: 'Empty Bank',
        email: 'empty@bank.com',
        phone: '0000000000',
        code: 'EMPTY-BANK',
        location: 'Delhi',
      });

      const tree = await OrganizationUnit.getHierarchyTree(emptyTenant._id);
      expect(tree).toHaveLength(0);

      await Tenant.deleteOne({ _id: emptyTenant._id });
    });
  });

  describe('Hierarchy validation', () => {
    test('should prevent invalid hierarchy (BRANCH under HO)', async () => {
      await expect(
        OrganizationUnit.create({
          tenantId,
          unitCode: 'BR-INVALID',
          unitName: 'Invalid Branch',
          unitType: 'BRANCH',
          parentUnitId: hoId, // Invalid: BRANCH cannot be under HO
        })
      ).rejects.toThrow();
    });

    test('should prevent invalid hierarchy (RO under HO)', async () => {
      await expect(
        OrganizationUnit.create({
          tenantId,
          unitCode: 'RO-INVALID',
          unitName: 'Invalid RO',
          unitType: 'RO',
          parentUnitId: hoId, // Invalid: RO cannot be under HO
        })
      ).rejects.toThrow();
    });

    test('should allow valid hierarchy (ZO under HO)', async () => {
      const timestamp = Date.now();
      const zo = await OrganizationUnit.create({
        tenantId,
        unitCode: `ZO-VALID-${String(timestamp).slice(-2)}`,
        unitName: 'Valid ZO',
        unitType: 'ZO',
        parentUnitId: hoId,
      });

      expect(zo).toBeDefined();
      await OrganizationUnit.deleteOne({ _id: zo._id });
    });
  });
});
