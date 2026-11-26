"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
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
  screenshots: string[];
  demo_url: string;
  package_url: string;
  version: string;
  repository_url: string;
  homepage_url: string;
  documentation_url: string;
  is_free: boolean;
  price: string;
  currency: string;
  status: string;
  is_featured: boolean;
  is_verified: boolean;
  config_schema: any;
  default_config: any;
  features: string[];
  requirements: any;
  downloads: number;
  installations: number;
  rating_average: number;
  rating_count: number;
  is_purchased: boolean;
  latest_version: any;
  review_summary: any;
  created_at: string;
  updated_at: string;
  published_at: string;
}

interface Review {
  id: string;
  user: {
    email: string;
    first_name: string;
    last_name: string;
  };
  rating: number;
  title: string;
  comment: string;
  is_verified_purchase: boolean;
  created_at: string;
}

export default function TemplateDetailPage({
  params,
}: {
  params: { slug: string };
}) {
  const router = useRouter();
  const [template, setTemplate] = useState<Template | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);

  useEffect(() => {
    fetchTemplate();
    fetchReviews();
  }, [params.slug]);

  const fetchTemplate = async () => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/templates/${params.slug}/`
      );
      if (response.ok) {
        const data = await response.json();
        setTemplate(data);
      }
    } catch (error) {
      console.error("Failed to fetch template:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchReviews = async () => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/templates/${params.slug}/reviews/`
      );
      if (response.ok) {
        const data = await response.json();
        setReviews(data);
      }
    } catch (error) {
      console.error("Failed to fetch reviews:", error);
    }
  };

  const handlePurchase = async () => {
    if (!template) return;

    setPurchasing(true);
    try {
      const token = localStorage.getItem("access_token");
      if (!token) {
        router.push(`/auth/login?redirect=/templates/${params.slug}`);
        return;
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/templates/${params.slug}/purchase/`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        alert(data.detail || "Template obtained successfully!");
        fetchTemplate(); // Refresh to update is_purchased
      } else {
        const error = await response.json();
        alert(error.detail || "Failed to purchase template");
      }
    } catch (error) {
      console.error("Purchase failed:", error);
      alert("An error occurred. Please try again.");
    } finally {
      setPurchasing(false);
    }
  };

  const handleDownload = async () => {
    if (!template) return;

    try {
      const token = localStorage.getItem("access_token");
      if (!token) {
        router.push(`/auth/login?redirect=/templates/${params.slug}`);
        return;
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/templates/${params.slug}/download/`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        window.open(data.package_url, "_blank");
      } else {
        const error = await response.json();
        alert(error.detail || "Failed to download template");
      }
    } catch (error) {
      console.error("Download failed:", error);
      alert("An error occurred. Please try again.");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (!template) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Template not found
          </h1>
          <Link href="/templates" className="text-blue-600 hover:underline">
            ← Back to templates
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Back link */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Link
            href="/templates"
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            ← Back to templates
          </Link>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Header */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h1 className="text-3xl font-bold text-gray-900 mb-2">
                    {template.name}
                  </h1>
                  <p className="text-gray-600">
                    by{" "}
                    {template.author.first_name || template.author.email}
                  </p>
                </div>
                <div className="flex gap-2">
                  {template.is_verified && (
                    <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-semibold">
                      ✓ Verified
                    </span>
                  )}
                  {template.is_featured && (
                    <span className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-sm font-semibold">
                      ⭐ Featured
                    </span>
                  )}
                </div>
              </div>

              {/* Stats */}
              <div className="flex items-center gap-6 text-sm text-gray-600">
                <div className="flex items-center gap-1">
                  <span>⬇️</span>
                  <span>{template.downloads} downloads</span>
                </div>
                <div className="flex items-center gap-1">
                  <span>⭐</span>
                  <span>
                    {template.rating_average.toFixed(1)} ({template.rating_count}{" "}
                    reviews)
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span>🏪</span>
                  <span>{template.installations} active stores</span>
                </div>
                <div>
                  <span className="bg-gray-100 px-2 py-1 rounded text-xs">
                    v{template.version}
                  </span>
                </div>
              </div>
            </div>

            {/* Thumbnail */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="relative h-96 bg-gray-200">
                {template.thumbnail ? (
                  <Image
                    src={template.thumbnail}
                    alt={template.name}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-400">
                    No preview available
                  </div>
                )}
              </div>
            </div>

            {/* Description */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                Description
              </h2>
              <p className="text-gray-700 whitespace-pre-line">
                {template.description}
              </p>
            </div>

            {/* Features */}
            {template.features && template.features.length > 0 && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">
                  Features
                </h2>
                <ul className="space-y-2">
                  {template.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <span className="text-green-500 mt-1">✓</span>
                      <span className="text-gray-700">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Screenshots */}
            {template.screenshots && template.screenshots.length > 0 && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">
                  Screenshots
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {template.screenshots.map((screenshot, index) => (
                    <div
                      key={index}
                      className="relative h-48 bg-gray-200 rounded"
                    >
                      <Image
                        src={screenshot}
                        alt={`Screenshot ${index + 1}`}
                        fill
                        className="object-cover rounded"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Reviews */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Reviews</h2>
              {reviews.length === 0 ? (
                <p className="text-gray-600">No reviews yet</p>
              ) : (
                <div className="space-y-4">
                  {reviews.map((review) => (
                    <div key={review.id} className="border-b pb-4 last:border-0">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="font-semibold">
                            {review.user.first_name || review.user.email}
                          </p>
                          <div className="flex items-center gap-2">
                            <span className="text-yellow-500">
                              {"★".repeat(review.rating)}
                              {"☆".repeat(5 - review.rating)}
                            </span>
                            {review.is_verified_purchase && (
                              <span className="text-xs text-green-600">
                                ✓ Verified Purchase
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="text-sm text-gray-500">
                          {new Date(review.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      {review.title && (
                        <p className="font-medium mb-1">{review.title}</p>
                      )}
                      {review.comment && (
                        <p className="text-gray-700">{review.comment}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow p-6 sticky top-4">
              {/* Price */}
              <div className="mb-6">
                {template.is_free ? (
                  <div className="text-3xl font-bold text-green-600">FREE</div>
                ) : (
                  <div className="text-3xl font-bold text-gray-900">
                    {template.price} {template.currency}
                  </div>
                )}
              </div>

              {/* CTA Buttons */}
              <div className="space-y-3 mb-6">
                {template.is_purchased ? (
                  <>
                    <button
                      onClick={handleDownload}
                      className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 transition"
                    >
                      Download Template
                    </button>
                    <p className="text-sm text-green-600 text-center">
                      ✓ You own this template
                    </p>
                  </>
                ) : (
                  <button
                    onClick={handlePurchase}
                    disabled={purchasing}
                    className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition disabled:bg-gray-400"
                  >
                    {purchasing
                      ? "Processing..."
                      : template.is_free
                      ? "Get Template"
                      : "Purchase Template"}
                  </button>
                )}

                {template.demo_url && (
                  <a
                    href={template.demo_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full text-center border-2 border-gray-300 py-3 rounded-lg font-semibold hover:border-gray-400 transition"
                  >
                    View Demo →
                  </a>
                )}
              </div>

              {/* Links */}
              <div className="space-y-2 border-t pt-4">
                {template.documentation_url && (
                  <a
                    href={template.documentation_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-blue-600 hover:underline text-sm"
                  >
                    📚 Documentation
                  </a>
                )}
                {template.repository_url && (
                  <a
                    href={template.repository_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-blue-600 hover:underline text-sm"
                  >
                    💻 Source Code
                  </a>
                )}
                {template.homepage_url && (
                  <a
                    href={template.homepage_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-blue-600 hover:underline text-sm"
                  >
                    🌐 Homepage
                  </a>
                )}
              </div>

              {/* Info */}
              <div className="border-t pt-4 mt-4 space-y-2 text-sm text-gray-600">
                <div>
                  <span className="font-semibold">Category:</span>{" "}
                  {template.category}
                </div>
                <div>
                  <span className="font-semibold">Type:</span>{" "}
                  {template.template_type}
                </div>
                {template.tags && template.tags.length > 0 && (
                  <div>
                    <span className="font-semibold">Tags:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {template.tags.map((tag, index) => (
                        <span
                          key={index}
                          className="bg-gray-100 px-2 py-1 rounded text-xs"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
