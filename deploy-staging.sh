#!/bin/bash
# Deploy template marketplace to staging
# Run this script on your local machine

set -e

echo "🚀 Deploying Koraa Template Marketplace to Staging..."
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
EC2_HOST="api.koraa.cm"
EC2_USER="ubuntu"
APP_DIR="/var/www/koraa"  # Adjust if different

echo -e "${YELLOW}Step 1: Finding EC2 instance...${NC}"
INSTANCE_ID=$(aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=*koraa*" "Name=instance-state-name,Values=running" \
  --query 'Reservations[0].Instances[0].InstanceId' \
  --output text)

if [ "$INSTANCE_ID" = "None" ] || [ -z "$INSTANCE_ID" ]; then
  echo "❌ Could not find running EC2 instance"
  echo "Please find your instance ID manually:"
  echo "  aws ec2 describe-instances --filters 'Name=tag:Name,Values=*koraa*'"
  exit 1
fi

echo -e "${GREEN}✓ Found instance: $INSTANCE_ID${NC}"
echo ""

echo -e "${YELLOW}Step 2: Connecting to server and deploying...${NC}"

# Create deployment script to run on server
cat > /tmp/deploy-templates.sh << 'DEPLOY_SCRIPT'
#!/bin/bash
set -e

cd /var/www/koraa || cd /home/ubuntu/koraa || cd ~/koraa

echo "📥 Pulling staging branch..."
sudo -u ubuntu git fetch origin
sudo -u ubuntu git checkout staging
sudo -u ubuntu git pull origin staging

echo ""
echo "⚠️  IMPORTANT: Fix PaymentTransaction model before migrations!"
echo ""
echo "Edit backend/apps/payments/models.py and add null=True to:"
echo "  - external_id (line ~53)"
echo "  - fapshi_transaction_id (line ~55)"
echo "  - plan (line ~63)"
echo ""
echo "Press Enter when done, or Ctrl+C to cancel..."
read

cd backend

echo "🔄 Activating virtual environment..."
source .venv/bin/activate 2>/dev/null || source venv/bin/activate

echo "📦 Installing dependencies..."
pip install -q --upgrade pip
pip install -q -r requirements.txt

echo "🗄️  Creating migrations..."
python manage.py makemigrations payments
python manage.py makemigrations themes

echo "🗄️  Applying migrations..."
python manage.py migrate

echo "📁 Collecting static files..."
python manage.py collectstatic --noinput

echo "🔄 Restarting services..."
if systemctl list-units --type=service | grep -q koraa; then
  sudo systemctl restart koraa-api || true
  sudo systemctl restart koraa-backend || true
elif [ -f "../infrastructure/docker/docker-compose.ec2.yml" ]; then
  cd ../infrastructure/docker
  docker-compose -f docker-compose.ec2.yml restart backend
else
  echo "⚠️  Could not find service to restart. Please restart manually."
fi

echo ""
echo "✅ Backend deployment complete!"
echo ""
echo "🧪 Testing API..."
curl -s http://localhost:8000/api/v1/templates/ | head -20

echo ""
echo "✅ Deployment complete!"
DEPLOY_SCRIPT

# Copy script to server
echo "Uploading deployment script..."
aws ssm send-command \
  --instance-ids "$INSTANCE_ID" \
  --document-name "AWS-RunShellScript" \
  --parameters commands="$(cat /tmp/deploy-templates.sh)" \
  --output text

echo -e "${GREEN}✓ Deployment initiated via SSM${NC}"
echo ""
echo -e "${YELLOW}Alternative: SSH directly${NC}"
echo "  ssh $EC2_USER@$EC2_HOST"
echo "  cd $APP_DIR"
echo "  git checkout staging && git pull"
echo "  cd backend && source .venv/bin/activate"
echo "  python manage.py migrate"
echo "  sudo systemctl restart koraa-api"
echo ""

echo -e "${YELLOW}Step 3: Verify deployment${NC}"
echo ""
echo "Backend API:"
echo "  curl https://api.koraa.cm/api/v1/templates/"
echo ""
echo "Admin Panel:"
echo "  https://api.koraa.cm/admin/themes/template/"
echo ""
echo "Frontend (after Vercel auto-deploy):"
echo "  https://koraa.cm/templates"
echo ""

echo -e "${GREEN}🎉 Staging deployment complete!${NC}"
echo ""
echo "📚 Next steps:"
echo "  1. Fix PaymentTransaction model (see prompt above)"
echo "  2. Run migrations"
echo "  3. Create test templates in admin"
echo "  4. Configure Fapshi webhook: https://api.koraa.cm/api/v1/templates/webhook/"
echo ""
echo "📖 Documentation: STAGING_DEPLOYMENT_GUIDE.md"
