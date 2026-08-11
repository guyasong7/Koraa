import os
import re
from glob import glob

def transform_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # Find the import from lucide-react
    # Handle multiline imports
    import_pattern = re.compile(r'import\s+\{([^}]+)\}\s+from\s+["\']lucide-react["\'];?', re.MULTILINE)
    match = import_pattern.search(content)
    if not match:
        return

    imported_str = match.group(1)
    
    # Extract individual icons, handle aliases (e.g., Store as StoreIcon)
    # also handle newlines and commas
    raw_icons = [i.strip() for i in imported_str.split(',')]
    raw_icons = [i for i in raw_icons if i]
    
    replacements = []
    new_imports = []
    
    for item in raw_icons:
        parts = item.split(' as ')
        original = parts[0].strip()
        alias = parts[1].strip() if len(parts) > 1 else None
        
        # New name in react-icons/lu is Lu + original
        lu_name = 'Lu' + original
        
        if alias:
            # import { LuStore as StoreIcon }
            new_imports.append(f"{lu_name} as {alias}")
            # we don't need to replace in content because it uses the alias
        else:
            new_imports.append(lu_name)
            # we need to replace original with lu_name in the rest of the file
            # careful with word boundaries
            replacements.append((original, lu_name))
            
    # Replace the import statement
    new_import_str = "import { " + ", ".join(new_imports) + " } from 'react-icons/lu';"
    content = content[:match.start()] + new_import_str + content[match.end():]
    
    # Replace usages
    for original, lu_name in replacements:
        # Match word boundaries for the JSX component, e.g. <Globe or Globe 
        # But wait, sometimes it's used in arrays or objects: icon: Globe
        # Use word boundary
        content = re.sub(rf'\b{original}\b', lu_name, content)
        
    with open(filepath, 'w') as f:
        f.write(content)
    print(f"Updated {filepath}")

for root, _, files in os.walk('apps/dashboard/src'):
    for f in files:
        if f.endswith('.tsx') or f.endswith('.ts'):
            transform_file(os.path.join(root, f))
