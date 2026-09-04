import os
import sys

# Set up Django environment
sys.path.append(os.getcwd())
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.base")
import django
django.setup()

from apps.storefront.models import StorefrontSection

sections = StorefrontSection.objects.exclude(settings__image="").order_by('-created_at')[:5]
for s in sections:
    print(f"Section {s.id}: image URL = {s.settings.get('image')}")
