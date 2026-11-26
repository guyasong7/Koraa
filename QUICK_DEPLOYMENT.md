# Quick Deployment Guide

## 1. Run Backend Migration

SSH to server and run:
```bash
ssh -i ~/.ssh/koraa-ec2.pem ubuntu@44.215.174.165
cd /home/ubuntu/koraa
docker compose -f infrastructure/docker/docker-compose.ec2.yml exec backend python manage.py makemigrations stores
docker compose -f infrastructure/docker/docker-compose.ec2.yml exec backend python manage.py migrate
```

## 2. Commit and Push Frontend

```bash
cd /home/reconraven/Documents/projects/koraa
git add -A
git commit -m "feat: add template marketplace to store management

- Created templates page at /dashboard/stores/[id]/templates
- Added Templates link to store quick links
- Backend API endpoint for applying templates
- Store model updated with template_applied field
- Category filtering and template browsing
- Apply template confirmation modal
- Free/paid template handling

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin staging
```

## 3. Test on Staging

Visit: https://staging.koraa.cm (after disabling Vercel protection)

Flow:
1. Login to dashboard
2. Go to Stores
3. Click "Manage" on a store
4. Click "Templates" card
5. Browse templates
6. Click "Apply" on a template
7. Confirm in modal

## Done!

The feature will be live on staging.koraa.cm once deployed.
