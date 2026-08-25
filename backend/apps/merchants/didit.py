import os
import requests
from django.conf import settings

DIDIT_API_KEY = getattr(settings, "DIDIT_API_KEY", os.environ.get("DIDIT_API_KEY", ""))
DIDIT_BASE_URL = "https://verification.didit.me/v3"


def _headers():
    if not DIDIT_API_KEY:
        raise ValueError("DIDIT_API_KEY is not configured.")
    return {"x-api-key": DIDIT_API_KEY}


def verify_identity_document(front_image_file, back_image_file=None, vendor_data=None):
    """
    Calls the Didit standalone ID Verification API.
    Accepts front image (required) and back image (optional).
    Returns the full JSON response dict.
    """
    url = f"{DIDIT_BASE_URL}/id-verification/"

    front_image_file.seek(0)
    files = {
        "front_image": (front_image_file.name, front_image_file, "image/jpeg")
    }
    if back_image_file:
        back_image_file.seek(0)
        files["back_image"] = (back_image_file.name, back_image_file, "image/jpeg")

    data = {}
    if vendor_data:
        data["vendor_data"] = str(vendor_data)

    try:
        response = requests.post(url, headers=_headers(), files=files, data=data, timeout=30)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        if hasattr(e, "response") and e.response is not None:
            err_msg = e.response.json().get("error", e.response.text)
            print(f"Didit ID-Verification Error: {err_msg}")
            raise ValueError(err_msg)
        raise


def verify_face_match(user_image_file, ref_image_file, vendor_data=None):
    """
    Calls the Didit Face-Match API.
    user_image_file — selfie (person holding the ID)
    ref_image_file  — the front scan of the ID document
    Returns the full JSON response dict.
    """
    url = f"{DIDIT_BASE_URL}/face-match/"

    user_image_file.seek(0)
    ref_image_file.seek(0)
    files = {
        "user_image": (user_image_file.name, user_image_file, "image/jpeg"),
        "ref_image":  (ref_image_file.name,  ref_image_file,  "image/jpeg"),
    }

    data = {}
    if vendor_data:
        data["vendor_data"] = str(vendor_data)

    try:
        response = requests.post(url, headers=_headers(), files=files, data=data, timeout=30)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        if hasattr(e, "response") and e.response is not None:
            err_msg = e.response.json().get("error", e.response.text)
            print(f"Didit Face-Match Error: {err_msg}")
            raise ValueError(err_msg)
        raise
