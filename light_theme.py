import re

with open("apps/dashboard/src/styles/globals.css", "r") as f:
    css = f.read()

# Replace surface variables
css = re.sub(r'--surface-950:\s*#[0-9a-fA-F]+;', '--surface-950: #f8fafc;', css)
css = re.sub(r'--surface-900:\s*#[0-9a-fA-F]+;', '--surface-900: #ffffff;', css)
css = re.sub(r'--surface-850:\s*#[0-9a-fA-F]+;', '--surface-850: #f1f5f9;', css)
css = re.sub(r'--surface-800:\s*#[0-9a-fA-F]+;', '--surface-800: #ffffff;', css)
css = re.sub(r'--surface-700:\s*#[0-9a-fA-F]+;', '--surface-700: #e2e8f0;', css)
css = re.sub(r'--surface-600:\s*#[0-9a-fA-F]+;', '--surface-600: #cbd5e1;', css)
css = re.sub(r'--surface-500:\s*#[0-9a-fA-F]+;', '--surface-500: #94a3b8;', css)

# Replace text variables
css = re.sub(r'--text-primary:\s*#[0-9a-fA-F]+;', '--text-primary: #0f1117;', css)
css = re.sub(r'--text-secondary:\s*#[0-9a-fA-F]+;', '--text-secondary: #475569;', css)
css = re.sub(r'--text-muted:\s*#[0-9a-fA-F]+;', '--text-muted: #64748b;', css)

# Replace borders and transparent whites with darks
css = css.replace("rgba(255, 255, 255, 0.05)", "rgba(0, 0, 0, 0.08)")
css = css.replace("rgba(255, 255, 255, 0.06)", "rgba(0, 0, 0, 0.1)")
css = css.replace("rgba(255, 255, 255, 0.08)", "rgba(0, 0, 0, 0.12)")
css = css.replace("rgba(255, 255, 255, 0.1)", "rgba(0, 0, 0, 0.15)")
css = css.replace("rgba(255, 255, 255, 0.12)", "rgba(0, 0, 0, 0.15)")

# Adjust glass
css = css.replace("rgba(26, 29, 39, 0.8)", "rgba(255, 255, 255, 0.85)")
css = css.replace("rgba(37, 40, 54, 0.6)", "rgba(255, 255, 255, 0.6)")

# Fix inputs for light mode so they don't look weird
css = re.sub(r'\.input {\n\s*width: 100%;\n\s*background: var\(--surface-900\);\n\s*border: 1px solid[^;]+;', 
             '.input {\n  width: 100%;\n  background: var(--surface-900);\n  border: 1px solid var(--surface-600);', css)

# Ensure cards have a subtle shadow in light mode for better contrast
css = re.sub(r'\.stat-card {\n\s*background: var\(--surface-800\);\n\s*border: 1px solid[^;]+;',
             '.stat-card {\n  background: var(--surface-800);\n  border: 1px solid var(--surface-700);\n  box-shadow: 0 1px 3px rgba(0,0,0,0.05);', css)

css = re.sub(r'\.table-container {\n\s*background: var\(--surface-800\);\n\s*border: 1px solid[^;]+;',
             '.table-container {\n  background: var(--surface-800);\n  border: 1px solid var(--surface-700);\n  box-shadow: 0 1px 3px rgba(0,0,0,0.05);', css)

css = re.sub(r'\.auth-card {\n\s*width: 100%;\n\s*max-width: 440px;\n\s*background: var\(--surface-900\);\n\s*border: 1px solid[^;]+;',
             '.auth-card {\n  width: 100%;\n  max-width: 440px;\n  background: var(--surface-900);\n  border: 1px solid var(--surface-700);\n  box-shadow: 0 4px 12px rgba(0,0,0,0.05);', css)
             
css = re.sub(r'\.sidebar {\n\s*position: fixed;.*?\n\s*background: var\(--surface-900\);\n\s*border-right: 1px solid[^;]+;',
             '.sidebar {\n  position: fixed;\n  left: 0;\n  top: 0;\n  bottom: 0;\n  width: var(--sidebar-width);\n  background: var(--surface-900);\n  border-right: 1px solid var(--surface-700);', css, flags=re.DOTALL)


with open("apps/dashboard/src/styles/globals.css", "w") as f:
    f.write(css)

print("Globals.css updated to light theme.")
