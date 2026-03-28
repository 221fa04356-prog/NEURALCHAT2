const mongoose = require('mongoose');
const { fieldEncryption } = require('mongoose-field-encryption');

const groupMessageSchema = new mongoose.Schema({
    group_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
    sender_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, default: 'user' },
    content: { type: String, default: '' },
    type: { type: String, enum: ['text', 'image', 'file', 'system', 'video', 'community_link', 'audio', 'contact'], default: 'text' },
    duration: { type: Number }, // in seconds
    metadata: { type: mongoose.Schema.Types.Mixed },
    file_path: { type: String },
    fileName: { type: String },
    fileSize: { type: Number },
    pageCount: { type: Number, default: 0 },
    thumbnail_path: { type: String },
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
    edited_at: { type: Date, default: null },
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
