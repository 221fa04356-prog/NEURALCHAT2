const User = require('../models/User');

/**
 * Applies name overrides for a specific requester to a user object or a list of user objects.
 * @param {Object|Array} users - A single user object or an array of user objects.
 * @param {string} requesterId - The ID of the user who is viewing the names.
 * @returns {Promise<Object|Array>} - The processed user(s) with name overrides applied.
 */
async function applyNameOverrides(users, requesterId) {
    if (!users || !requesterId) return users;

    try {
        const requester = await User.findById(requesterId).select('nameOverrides');
        if (!requester || !requester.nameOverrides) return users;

        const overrides = requester.nameOverrides;
        const isArray = Array.isArray(users);
        const userList = isArray ? users : [users];

        userList.forEach(u => {
            if (!u) return;
            const userId = u._id ? u._id.toString() : (u.id ? u.id.toString() : null);
            if (!userId) return;

            const customName = overrides instanceof Map ? overrides.get(userId) : overrides[userId];
            if (customName) {
                // If it's a Mongoose document, we might need to modify the _doc or toObject result
                if (u.toObject) {
                    // It's a Mongoose document, we can't easily modify it without it being a plain object
                    // but many routes already call toObject() or then(r => r.toObject())
                }
                u.name = customName;
            }
        });

        return isArray ? userList : userList[0];
    } catch (err) {
        console.error('[applyNameOverrides Error]', err);
        return users;
    }
}

module.exports = { applyNameOverrides };
