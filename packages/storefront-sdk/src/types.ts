"""
Types for Koraa storefront SDK.
"""

from typing import TypedDict, Literal, Optional, List, Dict, Any


# Template Types
TemplateType = Literal["official", "community", "premium"]
TemplateStatus = Literal["draft", "pending_review", "approved", "rejected", "archived"]
Category = Literal["fashion", "food", "electronics", "beauty", "general", "minimal", "bold"]


class TemplateMeta(TypedDict):
    """Template metadata."""
    id: str
    name: str
    version: str
    author: str
    description: str
    thumbnail: str
    categories: List[str]
    price: Optional[float]


class Store(TypedDict):
    """Store data provided to templates."""
    id: str
    name: str
    slug: str
    description: str
    logo: Optional[str]
    primary_color: str
    currency: str


class Product(TypedDict):
    """Product data provided to templates."""
    id: str
    name: str
    description: str
    price: float
    images: List[str]
    stock: int
    category: Optional[str]
