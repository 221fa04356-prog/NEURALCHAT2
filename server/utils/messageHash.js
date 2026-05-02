const crypto = require('crypto');

/**
 * Calculates a SHA-256 hash for a message to ensure immutability and chaining.
 * @param {Object} data - The message data components.
 * @returns {string} - The hex digest of the hash.
 */
const calculateMessageHash = (data) => {
    const { 
        previousHash = '', 
        senderId, 
        receiverId = '', 
        groupId = '', 
        content = '', 
        ciphertext = '', 
        timestamp 
    } = data;

    // We use a specific order and canonical format to ensure deterministic hashing
    const material = [
        previousHash,
        String(senderId),
        String(receiverId || groupId),
        content || ciphertext || '',
        new Date(timestamp).getTime()
    ].join('|');

    return crypto.createHash('sha256').update(material, 'utf8').digest('hex');
};

module.exports = { calculateMessageHash };
