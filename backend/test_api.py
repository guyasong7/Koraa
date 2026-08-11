import os
import django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "koraa.settings")
django.setup()

from django.test import Client
from django.contrib.auth import get_user_model
from apps.merchants.models import Merchant
from apps.stores.models import Store
from apps.products.models import Product

User = get_user_model()
user, _ = User.objects.get_or_create(email="test2@koraa.africa", defaults={"full_name": "Test", "role": "merchant"})
user.set_password("testpass")
user.save()
Merchant.objects.get_or_create(user=user, defaults={"business_name": "Test Business"})

c = Client()
resp = c.post("/api/v1/auth/login/", {"email": "test2@koraa.africa", "password": "testpass"}, content_type="application/json")
token = resp.json()["access"]

resp2 = c.get("/api/v1/merchants/stats/", HTTP_AUTHORIZATION=f"Bearer {token}")
print("STATUS:", resp2.status_code)
print("BODY:", resp2.content.decode())
