const CompetencyFramework = require('../models/CompetencyFramework');
const AuditLog = require('../models/AuditLog');

/** GET all competencies */
exports.getAllCompetencies = async (req, res) => {
    try {
        const { category, isActive, grade, role } = req.query;
        const filter = { tenantId: req.tenantId };
        if (category) filter.category = category;
        if (isActive !== undefined) filter.isActive = isActive === 'true';
        if (grade) filter.applicableGrades = grade;
        if (role) filter.applicableRoles = role;

        const competencies = await CompetencyFramework.find(filter).sort({ category: 1, name: 1 });
        res.json({ success: true, count: competencies.length, data: competencies });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/** GET single */
exports.getCompetency = async (req, res) => {
    try {
        const c = await CompetencyFramework.findOne({ _id: req.params.id, tenantId: req.tenantId });
        if (!c) return res.status(404).json({ success: false, message: 'Competency not found' });
        res.json({ success: true, data: c });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/** CREATE competency */
exports.createCompetency = async (req, res) => {
    try {
        const { name, code, category, description, proficiencyLevels, applicableRoles, applicableGrades, defaultWeightage } = req.body;

        if (!name || !code || !category || !description) {
            return res.status(400).json({ success: false, message: 'name, code, category, description are required' });
        }

        const existing = await CompetencyFramework.findOne({ tenantId: req.tenantId, code: code.toUpperCase() });
        if (existing) return res.status(400).json({ success: false, message: `Competency code '${code}' already exists` });

        const competency = await CompetencyFramework.create({
            tenantId: req.tenantId,
            name, code: code.toUpperCase(), category, description,
            proficiencyLevels: proficiencyLevels || getDefaultProficiencyLevels(),
            applicableRoles: applicableRoles || [],
            applicableGrades: applicableGrades || [],
            defaultWeightage: defaultWeightage || 10,
            isActive: true,
            createdBy: req.user._id || req.user.id,
        });

        await AuditLog.create({
            tenantId: req.tenantId,
            userId: req.user._id || req.user.id,
            userName: req.user.name || req.user.email,
            userEmail: req.user.email,
            action: 'Create',
            module: 'Competency Framework',
            details: JSON.stringify({ name, code, category }),
        });

        res.status(201).json({ success: true, data: competency });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/** UPDATE competency */
exports.updateCompetency = async (req, res) => {
    try {
        const allowed = ['name', 'description', 'proficiencyLevels', 'applicableRoles', 'applicableGrades', 'defaultWeightage', 'isActive'];
        const updates = {};
        allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

        const competency = await CompetencyFramework.findOneAndUpdate(
            { _id: req.params.id, tenantId: req.tenantId },
            { $set: { ...updates, updatedAt: new Date() } },
            { new: true }
        );

        if (!competency) return res.status(404).json({ success: false, message: 'Competency not found' });
        res.json({ success: true, data: competency });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/** DELETE (soft delete) */
exports.deleteCompetency = async (req, res) => {
    try {
        const competency = await CompetencyFramework.findOneAndUpdate(
            { _id: req.params.id, tenantId: req.tenantId },
            { isActive: false, updatedAt: new Date() },
            { new: true }
        );
        if (!competency) return res.status(404).json({ success: false, message: 'Competency not found' });
        res.json({ success: true, message: 'Competency deactivated' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/** Seed default competencies for a tenant */
exports.seedDefaultCompetencies = async (req, res) => {
    try {
        const existing = await CompetencyFramework.countDocuments({ tenantId: req.tenantId });
        if (existing > 0) {
            return res.status(400).json({ success: false, message: 'Competencies already seeded for this tenant' });
        }

        const defaults = getDefaultCompetencies(req.tenantId, req.user._id || req.user.id);
        await CompetencyFramework.insertMany(defaults);
        res.json({ success: true, message: `${defaults.length} default competencies added`, count: defaults.length });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ---- Helpers ----
function getDefaultProficiencyLevels() {
    return [
        { level: 1, label: 'Beginner', description: 'Basic awareness; requires guidance', behavioralIndicators: ['Shows basic understanding', 'Performs with supervision'] },
        { level: 2, label: 'Developing', description: 'Limited experience; can perform with some guidance', behavioralIndicators: ['Applies knowledge in familiar situations', 'Seeks help when needed'] },
        { level: 3, label: 'Proficient', description: 'Solid knowledge; performs independently', behavioralIndicators: ['Works independently', 'Handles most situations confidently'] },
        { level: 4, label: 'Advanced', description: 'Deep expertise; can mentor others', behavioralIndicators: ['Coaches colleagues', 'Handles complex scenarios'] },
        { level: 5, label: 'Expert', description: 'Recognized authority; drives innovation', behavioralIndicators: ['Recognized expert', 'Drives organizational change in this area'] },
    ];
}

function getDefaultCompetencies(tenantId, createdBy) {
    const levels = getDefaultProficiencyLevels();
    return [
        { tenantId, createdBy, code: 'COMM', name: 'Communication', category: 'Core', description: 'Ability to convey information clearly in written and verbal forms', proficiencyLevels: levels, defaultWeightage: 15, isActive: true },
        { tenantId, createdBy, code: 'TEAM', name: 'Teamwork & Collaboration', category: 'Core', description: 'Working effectively with others towards shared goals', proficiencyLevels: levels, defaultWeightage: 15, isActive: true },
        { tenantId, createdBy, code: 'CUST', name: 'Customer Focus', category: 'Core', description: 'Understanding and delivering on customer/stakeholder needs', proficiencyLevels: levels, defaultWeightage: 10, isActive: true },
        { tenantId, createdBy, code: 'INTG', name: 'Integrity & Ethics', category: 'Core', description: 'Acts with honesty, fairness, and adheres to organizational values', proficiencyLevels: levels, defaultWeightage: 10, isActive: true },
        { tenantId, createdBy, code: 'LDSH', name: 'Leadership', category: 'Leadership', description: 'Guides, motivates, and develops teams toward organizational goals', proficiencyLevels: levels, defaultWeightage: 20, applicableRoles: ['Manager', 'HR Administrator', 'Tenant Admin'], isActive: true },
        { tenantId, createdBy, code: 'STRG', name: 'Strategic Thinking', category: 'Leadership', description: 'Ability to align work to long-term organizational priorities', proficiencyLevels: levels, defaultWeightage: 15, applicableRoles: ['Manager', 'Tenant Admin'], isActive: true },
        { tenantId, createdBy, code: 'ANLC', name: 'Analytical & Problem Solving', category: 'Functional', description: 'Uses data and structured thinking to identify and resolve problems', proficiencyLevels: levels, defaultWeightage: 15, isActive: true },
        { tenantId, createdBy, code: 'INNV', name: 'Innovation & Initiative', category: 'Behavioral', description: 'Proactively identifies improvement opportunities and acts', proficiencyLevels: levels, defaultWeightage: 10, isActive: true },
        { tenantId, createdBy, code: 'ADPT', name: 'Adaptability', category: 'Behavioral', description: 'Effectively manages change and ambiguity in the workplace', proficiencyLevels: levels, defaultWeightage: 10, isActive: true },
        { tenantId, createdBy, code: 'COMP', name: 'Compliance & Risk Awareness', category: 'Functional', description: 'Understands and adheres to regulatory, policy, and risk guidelines', proficiencyLevels: levels, defaultWeightage: 15, applicableRoles: ['Tenant Admin', 'HR Administrator', 'Payroll Administrator'], isActive: true },
    ];
}
