import os
import re

def transform_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # Replace hardcoded green gradients
    content = re.sub(r'linear-gradient\([^,]+, #22c55e, #8b5cf6\)', 'linear-gradient(135deg, var(--brand-500), var(--accent-500))', content)
    content = re.sub(r'linear-gradient\([^,]+, #22c55e, #16a34a\)', 'linear-gradient(135deg, var(--brand-500), var(--brand-600))', content)
    
    # Replace other hardcoded hex colors
    content = content.replace('"#22c55e"', '"var(--brand-500)"')
    content = content.replace('"#8b5cf6"', '"var(--brand-300)"')
    content = content.replace('"#0a0a0f"', '"var(--surface-950)"')
    content = content.replace('"#1a1d27"', '"var(--surface-800)"')
    content = content.replace('"#f8fafc"', '"var(--text-primary)"')
    content = content.replace('"#16a34a"', '"var(--brand-600)"')
    
    # Special cases in CSS-in-JS style objects where we used hex directly without var() if we missed any
    # (The above replaces exact string matches of the props)

    with open(filepath, 'w') as f:
        f.write(content)

for root, _, files in os.walk('apps/dashboard/src'):
    for f in files:
        if f.endswith('.tsx'):
            transform_file(os.path.join(root, f))
