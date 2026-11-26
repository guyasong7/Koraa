#!/bin/bash
# Quick setup script for template marketplace

set -e

echo "🚀 Setting up Koraa Template Marketplace..."
echo ""

# Navigate to backend
cd "$(dirname "$0")/backend"

echo "📦 Installing dependencies..."
# .venv should already exist
source .venv/bin/activate

echo ""
echo "🔧 Creating migrations..."

# Make payments migrations first (RevenueSplit model)
python manage.py makemigrations payments --noinput || true

# Then themes migrations (depends on payments)
python manage.py makemigrations themes --noinput || true

echo ""
echo "📊 Applying migrations..."
python manage.py migrate --noinput

echo ""
echo "✅ Database setup complete!"
echo ""
echo "🎯 Next steps:"
echo "1. Create a superuser: python manage.py createsuperuser"
echo "2. Run the server: python manage.py runserver"
echo "3. Visit admin: http://localhost:8000/admin/themes/template/"
echo "4. Create test templates"
echo ""
echo "📚 Documentation:"
echo "- COMPLETE_IMPLEMENTATION_ALL_WEEKS.md - Full overview"
echo "- MIGRATION_FIX_GUIDE.md - If migrations fail"
echo "- TEMPLATE_SYSTEM_ARCHITECTURE.md - System design"
echo ""
echo "💰 Revenue sharing: 70% creator / 30% platform (automatic)"
echo ""
echo "🎉 Template marketplace ready!"
