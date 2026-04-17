const mongoose = require('mongoose');

const chatDeletionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // User who deleted the chat
    contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Contact whose chat was deleted
    contactName: { type: String }, // Storing name at deletion time for display
    deletedAt: { type: Date, default: Date.now }
});

// Index for quick lookup in admin history
chatDeletionSchema.index({ userId: 1, contactId: 1 });

module.exports = mongoose.model('ChatDeletion', chatDeletionSchema);
