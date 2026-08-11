import os
import re

def transform_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # Replace borderRadius: <number> with borderRadius: 0
    # EXCEPT for borderRadius: "50%" (which makes things circular, like avatars)
    
    # First pattern: borderRadius: 12, borderRadius: 20, etc
    content = re.sub(r'borderRadius:\s*\d+', 'borderRadius: 0', content)
    
    # Second pattern: borderRadius: "12px"
    content = re.sub(r'borderRadius:\s*"\d+px"', 'borderRadius: 0', content)
    
    with open(filepath, 'w') as f:
        f.write(content)

for root, _, files in os.walk('apps/dashboard/src'):
    for f in files:
        if f.endswith('.tsx'):
            transform_file(os.path.join(root, f))
