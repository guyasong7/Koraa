"""Categories URL routing — nested under stores."""
from django.urls import path
from .views import CategoryListCreateView, CategoryDetailView

urlpatterns = [
    path("stores/<uuid:store_pk>/categories/", CategoryListCreateView.as_view(), name="category-list-create"),
    path("stores/<uuid:store_pk>/categories/<uuid:pk>/", CategoryDetailView.as_view(), name="category-detail"),
]
