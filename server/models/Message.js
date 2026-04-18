const mongoose = require('mongoose');
const { fieldEncryption } = require('mongoose-field-encryption');

const messageSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    receiver_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // Added for P2P
    role: { type: String, required: true }, // 'user', 'ai' (model)
    content: { type: String },
    type: { type: String, enum: ['text', 'image', 'file', 'video', 'audio', 'contact', 'poll', 'event', 'system'], default: 'text' },
    duration: { type: Number }, // in seconds
    file_path: { type: String },
    fileName: { type: String },
    fileSize: { type: Number }, // in bytes
    pageCount: { type: Number, default: 0 }, // optional, for PDFs
    thumbnail_path: { type: String },
    is_view_once: { type: Boolean, default: false },
    is_viewed: { type: Boolean, default: false },
    is_opened: { type: Boolean, default: false },
    reply_to: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
    link_preview: {
        title: { type: String },
        description: { type: String },
        image: { type: String },
        url: { type: String },
        domain: { type: String }
    },
    is_pinned: { type: Boolean, default: false },
    pinned_at: { type: Date, default: null },
    pin_expires_at: { type: Date, default: null },
    pinned_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    starred_by: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    is_deleted_by_admin: { type: Boolean, default: false },
    is_deleted_by_user: { type: Boolean, default: false },
    deleted_for: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Array of user IDs who deleted this message for themselves
    is_flagged: { type: Boolean, default: false },
    flag_reason: { type: String, default: '' },

    is_forwarded: { type: Boolean, default: false },
    forward_count: { type: Number, default: 0 },
    is_read: { type: Boolean, default: false },
    read_at: { type: Date, default: null },
    
    // E2EE specific fields
    ciphertext: { type: String }, // Encrypted with Double Ratchet
    session_header: {             // Signal session headers for Bob to sync ratchet
        ephemeralKey: { type: String },
        ratchetKey: { type: String },
        preKeyId: { type: Number },
        signedPreKeyId: { type: Number }
    },
    
    is_edited: { type: Boolean, default: false },
    poll: {
        question: { type: String },
        options: [{
            text: { type: String },
            voters: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
        }],
        allowMultipleAnswers: { type: Boolean, default: true }
    },
    event: {
        name: { type: String },
        description: { type: String },
        startDate: { type: Date },
        startTime: { type: String },
        endDate: { type: Date },
        endTime: { type: String },
        location: { type: String },
        callOn: { type: Boolean },
        callType: { type: String }, // 'Video' or 'Voice'
        participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Users who are 'going'
        cancelled: { type: Boolean, default: false },
        cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        cancelledAt: { type: Date },
        responses: [{
            user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            status: { type: String, enum: ['Going', 'Maybe', 'Not going'] },
            updated_at: { type: Date, default: Date.now }
        }],
        response_history: [{
            user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            status: { type: String, enum: ['Going', 'Maybe', 'Not going'] },
            timestamp: { type: Date, default: Date.now }
        }],
        reminderTiming: { type: String, default: 'default' }
    },
    edited_at: { type: Date, default: null },
    reactions: [{
        user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        emoji: { type: String },
        created_at: { type: Date, default: Date.now }
    }],
    created_at: { type: Date, default: Date.now }
}, {
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Ensure encryption flags are always selected for transparent decryption
messageSchema.add({
    __enc_content: { type: Boolean, select: true, default: false },
    __enc_file_path: { type: Boolean, select: true, default: false },
    __enc_fileName: { type: Boolean, select: true, default: false },
    __enc_thumbnail_path: { type: Boolean, select: true, default: false }
});

// App-level Field Encryption
messageSchema.plugin(fieldEncryption, {
    fields: ["content", "file_path", "fileName", "thumbnail_path"],
    secret: process.env.DEFAULT_ENCRYPTION_SECRET,
    salt: process.env.DEFAULT_ENCRYPTION_SALT
});

// Add compound indexes for faster aggregation queries when pulling contact list
messageSchema.index({ user_id: 1, receiver_id: 1 });
messageSchema.index({ receiver_id: 1, user_id: 1 });
messageSchema.index({ created_at: -1 });

module.exports = mongoose.model('Message', messageSchema);
