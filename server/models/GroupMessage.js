const mongoose = require('mongoose');

const groupMessageSchema = new mongoose.Schema({
    group_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
    sender_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, default: 'user' },
    content: { type: String, default: '' },
    type: { type: String, enum: ['text', 'image', 'file', 'system', 'audio', 'video'], default: 'text' },
    file_path: { type: String },
    fileName: { type: String },
    fileSize: { type: Number },
    duration: { type: Number }, // Optional, for Audio
    is_view_once: { type: Boolean, default: false },
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
    created_at: { type: Date, default: Date.now }
}, {
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

module.exports = mongoose.model('GroupMessage', groupMessageSchema);
