"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";

interface Template {
  id: string;
  slug: string;
  name: string;
  description: string;
  author: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
  };
  template_type: string;
  category: string;
  tags: string[];
  thumbnail: string;
  demo_url: string;
  is_free: boolean;
  price: string;
  currency: string;
  is_featured: boolean;
  is_verified: boolean;
  downloads: number;
  installations: number;
  rating_average: number;
  rating_count: number;
  is_purchased: boolean;
  created_at: string;
  published_at: string;
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({
    category: "",
    is_free: "",
    search: "",
  });

  useEffect(() => {
    fetchTemplates();
  }, [filter]);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter.category) params.append("category", filter.category);
      if (filter.is_free) params.append("is_free", filter.is_free);
      if (filter.search) params.append("search", filter.search);

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/templates/?${params}`
      );
      const data = await response.json();
      setTemplates(data.results || data);
    } catch (error) {
      console.error("Failed to fetch templates:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <h1 className="text-4xl font-bold text-gray-900">
            Storefront Templates
          </h1>
          <p className="mt-2 text-lg text-gray-600">
            Beautiful, customizable templates for your online store
          </p>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Search */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Search
              </label>
              <input
                type="text"
                placeholder="Search templates..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                value={filter.search}
                onChange={(e) =>
                  setFilter({ ...filter, search: e.target.value })
                }
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Category
              </label>
              <select
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                value={filter.category}
                onChange={(e) =>
                  setFilter({ ...filter, category: e.target.value })
                }
              >
                <option value="">All Categories</option>
                <option value="fashion">Fashion</option>
                <option value="food">Food & Beverage</option>
                <option value="electronics">Electronics</option>
                <option value="beauty">Beauty</option>
                <option value="general">General</option>
                <option value="minimal">Minimal</option>
                <option value="bold">Bold</option>
              </select>
            </div>

            {/* Price */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Price
              </label>
              <select
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                value={filter.is_free}
                onChange={(e) =>
                  setFilter({ ...filter, is_free: e.target.value })
                }
              >
                <option value="">All Templates</option>
                <option value="true">Free</option>
                <option value="false">Premium</option>
              </select>
            </div>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            <p className="mt-2 text-gray-600">Loading templates...</p>
          </div>
        )}

        {/* Featured Templates */}
        {!loading && templates.some((t) => t.is_featured) && (
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              Featured Templates
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {templates
                .filter((t) => t.is_featured)
                .map((template) => (
                  <TemplateCard key={template.id} template={template} />
                ))}
            </div>
          </section>
        )}

        {/* All Templates */}
        {!loading && (
          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              All Templates
            </h2>
            {templates.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-lg">
                <p className="text-gray-600">No templates found</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {templates.map((template) => (
                  <TemplateCard key={template.id} template={template} />
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function TemplateCard({ template }: { template: Template }) {
  return (
    <Link
      href={`/templates/${template.slug}`}
      className="block bg-white rounded-lg shadow hover:shadow-lg transition-shadow overflow-hidden"
    >
      {/* Thumbnail */}
      <div className="relative h-48 bg-gray-200">
        {template.thumbnail ? (
          <Image
            src={template.thumbnail}
            alt={template.name}
            fill
            className="object-cover"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400">
            No preview
          </div>
        )}
        {template.is_featured && (
          <div className="absolute top-2 left-2 bg-yellow-400 text-yellow-900 px-2 py-1 rounded text-xs font-semibold">
            ⭐ Featured
          </div>
        )}
        {template.is_verified && (
          <div className="absolute top-2 right-2 bg-blue-500 text-white px-2 py-1 rounded text-xs font-semibold">
            ✓ Verified
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-1">
          {template.name}
        </h3>
        <p className="text-sm text-gray-600 mb-3 line-clamp-2">
          {template.description}
        </p>

        {/* Author */}
        <p className="text-xs text-gray-500 mb-3">
          by {template.author.first_name || template.author.email}
        </p>

        {/* Stats */}
        <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
          <div className="flex items-center gap-3">
            <span>⬇️ {template.downloads}</span>
            <span>
              ⭐ {template.rating_average.toFixed(1)} ({template.rating_count})
            </span>
          </div>
        </div>

        {/* Price & CTA */}
        <div className="flex items-center justify-between">
          {template.is_free ? (
            <span className="text-green-600 font-semibold">FREE</span>
          ) : (
            <span className="text-gray-900 font-semibold">
              {template.price} {template.currency}
            </span>
          )}
          <span className="text-sm text-blue-600 font-medium">
            View Details →
          </span>
        </div>
      </div>
    </Link>
  );
}
