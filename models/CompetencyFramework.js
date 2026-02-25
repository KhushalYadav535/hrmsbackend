const mongoose = require('mongoose');

/**
 * Competency Framework Model
 * BRD Requirement: Standard competency catalog for appraisal evaluation
 */
const competencyFrameworkSchema = new mongoose.Schema({
    tenantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tenant',
        required: true,
        index: true,
    },
    name: {
        type: String,
        required: true,
        trim: true,
    },
    code: {
        type: String,
        required: true,
        trim: true,
        uppercase: true,
    },
    category: {
        type: String,
        required: true,
        enum: ['Core', 'Functional', 'Leadership', 'Technical', 'Behavioral'],
    },
    description: {
        type: String,
        required: true,
        trim: true,
    },
    // Proficiency levels (1–5 with behavioral indicators)
    proficiencyLevels: [
        {
            level: { type: Number, required: true, min: 1, max: 5 },
            label: { type: String, required: true }, // e.g., 'Beginner', 'Developing', 'Proficient', 'Advanced', 'Expert'
            description: { type: String, required: true },
            behavioralIndicators: [String],
        },
    ],
    // Applicable roles/grades
    applicableRoles: [String],
    applicableGrades: [String],
    // Weightage in appraisal (%)
    defaultWeightage: {
        type: Number,
        default: 10,
        min: 0,
        max: 100,
    },
    isActive: {
        type: Boolean,
        default: true,
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

competencyFrameworkSchema.index({ tenantId: 1, code: 1 }, { unique: true });
competencyFrameworkSchema.index({ tenantId: 1, category: 1, isActive: 1 });

competencyFrameworkSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model('CompetencyFramework', competencyFrameworkSchema);
