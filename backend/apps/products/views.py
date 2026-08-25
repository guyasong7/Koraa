"""Products views — store-scoped."""
from django.http import StreamingHttpResponse
from django.utils import timezone

from rest_framework import generics, permissions, filters
from rest_framework import status as http_status
from rest_framework.exceptions import NotFound
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import OpenApiParameter, extend_schema

from apps.stores.access import accessible_stores
from . import csv_io
from .models import Product, ProductFile, ProductImage
from .serializers import (
    ProductListSerializer,
    ProductDetailSerializer,
    ProductCreateSerializer,
    ProductFileSerializer,
    ProductImageSerializer,
)


def get_accessible_store(user, store_pk):
    """The store ``store_pk`` if the user owns it or was invited to it.

    Managing the catalogue is the main thing a teammate is invited for, so
    this is the shared access rule rather than an owner-only check.
    """
    store = accessible_stores(user).filter(pk=store_pk).first()
    if store is None:
        raise NotFound("Store not found or you do not have access.")
    return store


@extend_schema(tags=["products"])
class ProductListCreateView(generics.ListCreateAPIView):
    """
    GET  /stores/{store_id}/products/  — List products (with filters)
    POST /stores/{store_id}/products/  — Create product
    """
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["status", "product_type", "is_featured", "category"]
    search_fields = ["name", "description", "variants__sku"]
    ordering_fields = ["created_at", "name", "base_price"]
    ordering = ["-created_at"]

    def get_store(self):
        return get_accessible_store(self.request.user, self.kwargs["store_pk"])

    def get_serializer_class(self):
        return ProductCreateSerializer if self.request.method == "POST" else ProductListSerializer

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Product.objects.none()
        try:
            store = self.get_store()
            return (
                Product.objects
                .filter(store=store)
                .select_related("category")
                .prefetch_related("images", "variants")
            )
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Error in ProductListCreateView.get_queryset: {e}")
            raise

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["store"] = self.get_store()
        return ctx

    def create(self, request, *args, **kwargs):
        from rest_framework import status
        from rest_framework.response import Response
        from rest_framework.exceptions import PermissionDenied
        
        store = get_accessible_store(request.user, self.kwargs["store_pk"])
        
        # Enforce product limits
        if not store.merchant.can_add_product:
            raise PermissionDenied("You have reached the maximum number of products for your subscription tier. Please upgrade to Pro.")
            
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        product = serializer.save()
        return Response(ProductDetailSerializer(product).data, status=status.HTTP_201_CREATED)


@extend_schema(tags=["products"])
class ProductDetailView(generics.RetrieveUpdateDestroyAPIView):
    """GET|PATCH|DELETE /stores/{store_id}/products/{id}/"""
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.request.method in ("PUT", "PATCH"):
            return ProductCreateSerializer
        return ProductDetailSerializer

    def get_queryset(self):
        store = get_accessible_store(self.request.user, self.kwargs["store_pk"])
        return (
            Product.objects
            .filter(store=store)
            .select_related("category")
            .prefetch_related("images", "options__values", "variants__option_values")
        )


@extend_schema(tags=["products"])
class ProductImageUploadView(generics.GenericAPIView):
    """
    POST /stores/{store_pk}/products/{product_pk}/images/upload/

    Accepts a multipart image, strips its background with rembg,
    and saves it as a ProductImage attached to the product.

    Query param:
      ?remove_bg=1   (default) — run background removal
      ?remove_bg=0   — skip background removal, save as-is
    """
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ProductImageSerializer

    def get_product(self):
        store = get_accessible_store(self.request.user, self.kwargs["store_pk"])
        try:
            return Product.objects.get(pk=self.kwargs["product_pk"], store=store)
        except Product.DoesNotExist:
            from rest_framework.exceptions import NotFound
            raise NotFound("Product not found.")

    def post(self, request, *args, **kwargs):
        from rest_framework import status as http_status
        from rest_framework.response import Response
        from django.core.files.base import ContentFile
        import io

        product = self.get_product()
        image_file = request.FILES.get("image")
        if not image_file:
            return Response({"detail": "No image file provided."}, status=http_status.HTTP_400_BAD_REQUEST)

        # Validate type
        if not image_file.content_type.startswith("image/"):
            return Response({"detail": "Uploaded file must be an image."}, status=http_status.HTTP_400_BAD_REQUEST)

        remove_bg = request.query_params.get("remove_bg", "1") != "0"

        raw_bytes = image_file.read()

        if remove_bg:
            try:
                from rembg import remove as rembg_remove
                from PIL import Image

                input_image = Image.open(io.BytesIO(raw_bytes)).convert("RGBA")
                output_image = rembg_remove(input_image)

                # Save as PNG to preserve transparency
                output_buffer = io.BytesIO()
                output_image.save(output_buffer, format="PNG", optimize=True)
                final_bytes = output_buffer.getvalue()
                filename = image_file.name.rsplit(".", 1)[0] + "_nobg.png"
                content_type = "image/png"
            except Exception as exc:
                # Graceful fallback: save original if rembg fails
                import logging
                logging.getLogger(__name__).warning("rembg failed: %s — saving original", exc)
                final_bytes = raw_bytes
                filename = image_file.name
        else:
            final_bytes = raw_bytes
            filename = image_file.name

        # Determine if this should be the primary image
        is_primary = not product.images.exists()

        product_image = ProductImage.objects.create(
            product=product,
            alt_text=product.name,
            is_primary=is_primary,
        )
        product_image.image.save(filename, ContentFile(final_bytes), save=True)

        return Response(ProductImageSerializer(product_image).data, status=http_status.HTTP_201_CREATED)


class ProductImageDeleteView(generics.DestroyAPIView):
    """
    DELETE /stores/{store_pk}/products/{product_pk}/images/{image_pk}/
    Deletes a specific product image.
    """
    serializer_class = ProductImageSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        store_id = self.kwargs.get("store_pk")
        product_id = self.kwargs.get("product_pk")
        return ProductImage.objects.filter(
            product__id=product_id,
            product__store__id=store_id,
            product__store__in=accessible_stores(self.request.user),
        )


# ── Digital product files ─────────────────────────────────────────────────────
#
# The assets behind a digital product. Scoped through ``get_accessible_store``
# like everything else in this module, so a teammate invited to one shop can
# upload files for that shop's products and no others.
#
# Nothing here serves a file. ``ProductFile.file`` lands under MEDIA_ROOT, which
# is publicly readable, so the buyer's route
# (``apps.orders.views.PublicDownloadFileView``) streams the bytes under a token
# and the raw media URL is never handed out.

#: Deliberately generous — merchants sell fonts, videos, sample packs and PSDs,
#: and a limit that rejects a legitimate product is worse than one that lets a
#: large file through. Held here rather than in settings because it is a product
#: decision, not a deployment one.
MAX_PRODUCT_FILE_BYTES = 512 * 1024 * 1024

#: Extensions refused whatever the merchant intends. Not a security boundary —
#: the file is only ever streamed as an attachment, never executed — but a
#: storefront that will host an .exe becomes a malware distributor the first time
#: an account is compromised.
BLOCKED_FILE_EXTENSIONS = {
    "exe", "msi", "bat", "cmd", "com", "scr", "cpl", "jar",
    "vbs", "vbe", "js", "jse", "wsf", "wsh", "ps1", "sh", "php", "phtml",
}


class ProductFileListCreateView(generics.ListCreateAPIView):
    """
    GET  /stores/{store_pk}/products/{product_pk}/files/  — list the assets
    POST /stores/{store_pk}/products/{product_pk}/files/  — upload one

    A digital product may be several files, so this is a list. Upload is
    multipart with the file under ``file`` and an optional ``label``.
    """

    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]
    serializer_class = ProductFileSerializer
    pagination_class = None

    def get_product(self):
        store = get_accessible_store(self.request.user, self.kwargs["store_pk"])
        product = Product.objects.filter(
            pk=self.kwargs["product_pk"], store=store
        ).first()
        if product is None:
            raise NotFound("Product not found.")
        return product

    def get_queryset(self):
        return self.get_product().files.all()

    def create(self, request, *args, **kwargs):
        product = self.get_product()
        upload = request.FILES.get("file")
        if not upload:
            return Response(
                {"detail": "No file provided."}, status=http_status.HTTP_400_BAD_REQUEST
            )

        extension = upload.name.rsplit(".", 1)[-1].lower() if "." in upload.name else ""
        if extension in BLOCKED_FILE_EXTENSIONS:
            return Response(
                {"detail": f".{extension} files cannot be sold through Koraa."},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        if upload.size > MAX_PRODUCT_FILE_BYTES:
            limit_mb = MAX_PRODUCT_FILE_BYTES // (1024 * 1024)
            return Response(
                {"detail": f"That file is larger than {limit_mb} MB."},
                status=http_status.HTTP_400_BAD_REQUEST,
            )

        last = product.files.order_by("-sort_order").first()
        product_file = ProductFile.objects.create(
            product=product,
            file=upload,
            label=(request.data.get("label") or "").strip()[:255],
            sort_order=(last.sort_order + 1) if last else 0,
        )

        # A file has been attached, so this is a digital product whatever the
        # form said. Merchants reach for Upload before they notice the type
        # selector, and a digital product left as "simple" sells with no
        # delivery — the buyer pays and receives nothing.
        if product.product_type == Product.ProductType.SIMPLE:
            product.product_type = Product.ProductType.DIGITAL
            product.save(update_fields=["product_type"])

        return Response(
            ProductFileSerializer(product_file, context={"request": request}).data,
            status=http_status.HTTP_201_CREATED,
        )


class ProductFileDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET/PATCH/DELETE /stores/{store_pk}/products/{product_pk}/files/{pk}/

    PATCH takes ``label`` and ``sort_order``; the file itself is replaced by
    deleting and uploading, which keeps ``size_bytes`` honest.
    """

    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ProductFileSerializer

    def get_queryset(self):
        return ProductFile.objects.filter(
            product__id=self.kwargs["product_pk"],
            product__store__id=self.kwargs["store_pk"],
            product__store__in=accessible_stores(self.request.user),
        )

    def perform_destroy(self, instance):
        # The stored object goes with the row. A merchant who removes a file
        # expects it gone, and orphaned uploads are what fills a bucket.
        instance.file.delete(save=False)
        instance.delete()


class ProductAIAutoFillView(generics.GenericAPIView):
    """
    POST /stores/{store_pk}/products/ai-suggest/
    Takes an image upload and asks DeepSeek to auto-fill the product form.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        from rest_framework import status as http_status
        from rest_framework.response import Response
        import base64
        import json
        import logging
        import traceback
        import requests
        from decouple import config

        logger = logging.getLogger(__name__)

        image_file = request.FILES.get("image")
        if not image_file:
            return Response({"detail": "No image file provided."}, status=http_status.HTTP_400_BAD_REQUEST)

        # Validate MIME type — only png/jpeg/gif/webp supported by vision models
        allowed_mimes = {"image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"}
        mime_type = image_file.content_type or "image/jpeg"
        if mime_type not in allowed_mimes:
            return Response(
                {"detail": f"Unsupported image format '{mime_type}'. Upload a PNG, JPEG, GIF, or WebP."},
                status=http_status.HTTP_400_BAD_REQUEST
            )

        raw_bytes = image_file.read()
        b64_img = base64.b64encode(raw_bytes).decode("utf-8")

        or_api_key = config("OPENROUTER_API_KEY", default="")
        or_model = config("OPENROUTER_MODEL", default="openai/gpt-4o-mini")
        or_base_url = "https://openrouter.ai/api/v1/chat/completions"

        if not or_api_key:
            return Response(
                {"detail": "OPENROUTER_API_KEY is not configured."},
                status=http_status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        messages = [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            "You are an ecommerce product specialist for the African market, specifically analyzing products similar to those sold on buyam.co. "
                            "Analyze this product image and return ONLY a valid JSON object — no markdown, no explanation — with these exact keys:\n"
                            "- name: catchy product name (string)\n"
                            "- short_description: 1 sentence summary (string)\n"
                            "- description: detailed multi-paragraph description (string)\n"
                            "- base_price: realistic price based on buyam.co pricing in CFA Francs (XAF) as a number string e.g. '15000' (string)\n"
                            "- weight: weight in kg e.g. '0.5' (string)\n"
                            "- seo_title: max 70 chars (string)\n"
                            "- seo_description: max 160 chars (string)\n"
                            "- sku: a unique SKU following the pattern KORAA-[3_LETTER_CATEGORY_PREFIX]-[4_RANDOM_DIGITS] e.g. 'KORAA-ELC-4921' (string)"
                        )
                    },
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:{mime_type};base64,{b64_img}"}
                    }
                ]
            }
        ]

        result_text = ""
        try:
            logger.info(f"AI auto-fill: calling {or_model} via OpenRouter")
            
            resp = requests.post(
                or_base_url,
                headers={
                    "Authorization": f"Bearer {or_api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": or_model,
                    "messages": messages,
                    "max_tokens": 900,
                    "temperature": 0.4,
                },
                timeout=60
            )
            
            resp_data = resp.json()
            if "error" in resp_data:
                raise Exception(f"OpenRouter API Error: {resp_data['error']}")
                
            result_text = resp_data["choices"][0]["message"]["content"].strip()
            logger.info(f"AI raw response: {result_text[:200]}")

            # Strip markdown fences if model disobeyed
            for prefix in ("```json", "```"):
                if result_text.startswith(prefix):
                    result_text = result_text[len(prefix):]
            if result_text.endswith("```"):
                result_text = result_text[:-3]
            result_text = result_text.strip()

            result_json = json.loads(result_text)
            return Response(result_json, status=http_status.HTTP_200_OK)

        except json.JSONDecodeError as jde:
            logger.error(f"AI returned non-JSON. Raw: {result_text!r} | Error: {jde}")
            return Response(
                {"detail": "AI returned malformed data. Please try again."},
                status=http_status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        except Exception as exc:
            logger.error(f"AI auto-fill failed:\n{traceback.format_exc()}")
            return Response(
                {"detail": f"AI generation failed: {str(exc)}"},
                status=http_status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# ── Import & Export ───────────────────────────────────────────────────────────

@extend_schema(tags=["products"])
class ProductExportView(APIView):
    """
    GET /stores/{store_id}/products/export/  — the catalogue as a CSV.

    Streamed, and in the same column order the importer accepts, so the file a
    merchant downloads is one they can edit in a spreadsheet and put straight
    back.
    """

    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(
        responses={(200, "text/csv"): {"type": "string", "format": "binary"}},
        parameters=[
            OpenApiParameter(
                "template",
                bool,
                description="Return a one-row example file instead of the catalogue.",
            )
        ],
    )
    def get(self, request, store_pk):
        store = get_accessible_store(request.user, store_pk)

        wants_template = str(
            request.query_params.get("template", "")
        ).lower() in ("1", "true", "yes")

        if wants_template:
            rows = csv_io.template_rows()
            name = "koraa-product-template.csv"
        else:
            rows = csv_io.export_rows(store, request)
            name = f"{store.slug}-products-{timezone.localdate().isoformat()}.csv"

        response = StreamingHttpResponse(rows, content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="{name}"'
        return response


@extend_schema(tags=["products"])
class ProductImportView(APIView):
    """
    POST /stores/{store_id}/products/import/  — create or update from a CSV.

    Two-step by design. The first call is a dry run: it parses, validates and
    reports what would change, and writes nothing. Sending ``commit=true``
    applies it. A file with prices in the name column should be found out before
    it has created forty products, not after.
    """

    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    @extend_schema(request=None, responses={200: None})
    def post(self, request, store_pk):
        store = get_accessible_store(request.user, store_pk)

        upload = request.FILES.get("file")
        if upload is None:
            return Response(
                {"detail": "Attach a CSV file as “file”."},
                status=http_status.HTTP_400_BAD_REQUEST,
            )

        # 5 MB. A 1000-product catalogue of text is well under a megabyte, so
        # anything larger is a spreadsheet with images pasted into it.
        if upload.size and upload.size > 5 * 1024 * 1024:
            return Response(
                {"detail": "That file is larger than 5 MB. Export a fresh copy and edit that."},
                status=http_status.HTTP_400_BAD_REQUEST,
            )

        parsed = csv_io.parse(upload)
        rows, errors = parsed["rows"], parsed["errors"]

        if not rows:
            return Response(
                {
                    "committed": False,
                    "errors": errors or ["That file has no product rows in it."],
                    "create": 0,
                    "update": 0,
                },
                status=http_status.HTTP_400_BAD_REQUEST,
            )

        preview = csv_io.plan(store, rows)
        commit = str(request.data.get("commit", "")).lower() in ("1", "true", "yes")

        if not commit:
            return Response({"committed": False, "errors": errors, **preview})

        # A file with any bad row is not applied. Importing the good half leaves
        # the merchant with a catalogue that is neither the old one nor the file,
        # and no way to tell which rows landed.
        if errors:
            return Response(
                {"committed": False, "errors": errors, **preview},
                status=http_status.HTTP_400_BAD_REQUEST,
            )

        result = csv_io.apply(store, rows)
        return Response({"committed": True, "errors": [], **preview, **result})


