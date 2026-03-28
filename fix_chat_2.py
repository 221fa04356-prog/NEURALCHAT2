import os

file_path = r'c:\Users\chimr\OneDrive\Desktop\NEU14\chatNeural2\client\src\pages\Chat.jsx'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix the specific deleted line from the previous run
broken_part = 'const { member, communityId } = assignOwnerTarget;'
fixed_part = '    const renderAssignOwnerModal = () => {\\n        if (!isAssignOwnerModalOpen || !assignOwnerTarget) return null;\\n        const { member, communityId } = assignOwnerTarget;'

if 'const renderAssignOwnerModal = () => {' not in content:
    content = content.replace(broken_part, fixed_part)

# Also fix literal \\n if they still exist anywhere
content = content.replace('\\\\n', '\\n')

with open(file_path, 'w', encoding='utf-8', newline='\\n') as f:
    f.write(content)
