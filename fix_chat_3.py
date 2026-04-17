import os

file_path = r'c:\Users\chimr\OneDrive\Desktop\NEU14\chatNeural2\client\src\pages\Chat.jsx'

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    # Remove literal \n if it appeared at end of line (this happened from python script previously)
    if '\\n' in line:
        line = line.replace('\\n', '\n')
    new_lines.append(line)

# Search for the place where renderAssignOwnerModal was deleted
final_lines = []
inserted = False
for line in new_lines:
    if 'const { member, communityId } = assignOwnerTarget;' in line and not inserted:
        final_lines.append('    const renderAssignOwnerModal = () => {\n')
        final_lines.append('        if (!isAssignOwnerModalOpen || !assignOwnerTarget) return null;\n')
        inserted = True
    final_lines.append(line)

with open(file_path, 'w', encoding='utf-8') as f:
    f.writelines(final_lines)
