const mongoose = require('mongoose');

/**
 * Updates a model instance (Group or Community) when users join/rejoin.
 * Implements the 24-hour history rule.
 */
const handleMembershipJoin = (modelInstance, userIds) => {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    if (!modelInstance.userHistory) {
        modelInstance.userHistory = [];
    }

    const ids = Array.isArray(userIds) ? userIds : [userIds];
    
    ids.forEach(uid => {
        const uIdStr = uid.toString();
        const objId = new mongoose.Types.ObjectId(uIdStr);
        
        // 1. Ensure in members array
        if (!modelInstance.members.map(m => m.toString()).includes(uIdStr)) {
            modelInstance.members.push(objId);
        }

        // 2. Pull from removedMembers
        if (modelInstance.removedMembers) {
            modelInstance.removedMembers = modelInstance.removedMembers.filter(m => m.toString() !== uIdStr);
        }

        // 3. Update History
        let history = modelInstance.userHistory.find(h => h.user.toString() === uIdStr);
        if (history) {
            // Rule: If rejoin after 24 hrs of leaving -> reset visibleFrom (see only new chat)
            // If rejoin within 24 hrs -> keep existing visibleFrom (see old chat)
            if (history.leftAt && history.leftAt < twentyFourHoursAgo) {
                history.visibleFrom = now;
                console.log(`[Membership] User ${uIdStr} rejoined after 24h. History reset.`);
            } else {
                console.log(`[Membership] User ${uIdStr} rejoined within 24h. History preserved.`);
            }
            history.joinedAt = now;
            history.leftAt = undefined;
        } else {
            // First time ever joining. 
            // We set it to 1 minute ago to ensure system messages created during the same process are visible.
            const visibleFromDate = new Date(now.getTime() - 60000); 
            modelInstance.userHistory.push({
                user: objId,
                joinedAt: now,
                visibleFrom: visibleFromDate
            });
        }
    });
};

/**
 * Updates a model instance when a user exits.
 */
const handleMembershipExit = (modelInstance, userId) => {
    const now = new Date();
    const uIdStr = userId.toString();
    const objId = new mongoose.Types.ObjectId(uIdStr);

    // 1. Remove from members
    modelInstance.members = modelInstance.members.filter(m => m.toString() !== uIdStr);
    
    // 2. Handle admins (for communities)
    if (modelInstance.admins) {
        modelInstance.admins = modelInstance.admins.filter(a => a.toString() !== uIdStr);
    }

    // 3. Add to removedMembers
    if (modelInstance.removedMembers) {
        if (!modelInstance.removedMembers.map(m => m.toString()).includes(uIdStr)) {
            modelInstance.removedMembers.push(objId);
        }
    }

    // 4. Update History
    if (!modelInstance.userHistory) modelInstance.userHistory = [];
    let history = modelInstance.userHistory.find(h => h.user.toString() === uIdStr);
    if (history) {
        history.leftAt = now;
    } else {
        // Fallback if no history was present
        modelInstance.userHistory.push({
            user: objId,
            joinedAt: now, 
            leftAt: now,
            visibleFrom: now 
        });
    }
};

module.exports = { handleMembershipJoin, handleMembershipExit };
