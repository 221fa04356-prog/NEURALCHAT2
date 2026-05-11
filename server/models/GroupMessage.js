const mongoose = require('mongoose');
const { fieldEncryption } = require('mongoose-field-encryption');

const groupMessageSchema = new mongoose.Schema({
    group_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
    sender_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, default: 'user' },
    content: { type: String, default: '' },
    type: { type: String, enum: ['text', 'image', 'file', 'system', 'video', 'community_link', 'audio', 'contact', 'poll', 'event'], default: 'text' },
    duration: { type: Number }, // in seconds
    metadata: { type: mongoose.Schema.Types.Mixed },
    file_path: { type: String },
    fileName: { type: String },
    fileSize: { type: Number },
    pageCount: { type: Number, default: 0 },
    thumbnail_path: { type: String },
    reply_to: { type: mongoose.Schema.Types.ObjectId, ref: 'GroupMessage', default: null },
    is_view_once: { type: Boolean, default: false },
    is_viewed: { type: Boolean, default: false },
    is_opened: { type: Boolean, default: false },
    is_system: { type: Boolean, default: false }, // For "You created this group" type messages
    is_pinned: { type: Boolean, default: false },
    pinned_at: { type: Date, default: null },
    pin_expires_at: { type: Date, default: null },
    pinned_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    starred_by: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    is_deleted_by_admin: { type: Boolean, default: false },
    is_deleted_by_user: { type: Boolean, default: false },
    deleted_for: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Array of user IDs who deleted this message for themselves
    read_by: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    read_details: [{
        user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        read_at: { type: Date, default: Date.now }
    }],
    is_forwarded: { type: Boolean, default: false },
    forward_count: { type: Number, default: 0 },
    is_read: { type: Boolean, default: false },
    
    // E2EE specific fields
    ciphertext: { type: String }, // Encrypted with Sender Key
    sender_key_id: { type: String }, // To identify which key to use
    
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
        rescheduledAt: { type: Date },
        rescheduledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
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
    message_hash: { type: String, unique: true, sparse: true },
    previous_message_hash: { type: String, sparse: true },
    scheduled_message_id: { type: mongoose.Schema.Types.ObjectId, ref: 'ScheduledMessage', default: null },
    scheduled_created_at: { type: Date, default: null },
    created_at: { type: Date, default: Date.now }
}, {
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Always select encryption flags to trigger transparency
groupMessageSchema.add({
    __enc_content: { type: Boolean, select: true, default: false },
    __enc_file_path: { type: Boolean, select: true, default: false },
    __enc_fileName: { type: Boolean, select: true, default: false },
    __enc_thumbnail_path: { type: Boolean, select: true, default: false }
});

// App-level Field Encryption
groupMessageSchema.plugin(fieldEncryption, {
    fields: ["content", "file_path", "fileName", "thumbnail_path"],
    secret: process.env.DEFAULT_ENCRYPTION_SECRET,
    salt: process.env.DEFAULT_ENCRYPTION_SALT
});

module.exports = mongoose.model('GroupMessage', groupMessageSchema);
