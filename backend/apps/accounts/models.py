"""
Accounts models — Custom User, OTP, and Password Reset.

Design decisions:
- UUIDs as primary keys (security: avoids enumeration attacks)
- Email-only login (no username)
- Argon2 password hashing (via settings.PASSWORD_HASHERS)
- OTP stored hashed (SHA-256)
"""

import uuid
import hashlib
import secrets
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _


class UserManager(BaseUserManager):
    """Custom manager for the email-based User model."""

    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("Email address is required.")
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("is_verified", True)
        return self.create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    """
    Koraa platform user.
    Supports both merchants (store owners) and shoppers (customers).
    """

    class Role(models.TextChoices):
        MERCHANT = "merchant", _("Merchant")
        SHOPPER = "shopper", _("Shopper")
        STAFF = "staff", _("Staff")
        ADMIN = "admin", _("Admin")

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(_("email address"), unique=True, db_index=True)
    full_name = models.CharField(_("full name"), max_length=255, blank=True)
    phone = models.CharField(_("phone number"), max_length=20, blank=True)
    avatar = models.ImageField(_("avatar"), upload_to="avatars/", blank=True, null=True)
    # A photo hosted by the identity provider, kept alongside `avatar` rather
    # than downloaded into it: Google hands us a CDN URL, and copying every
    # sign-in's photo into our own storage would cost bandwidth and space for
    # an image Google already serves. `avatar` wins when both are set, so an
    # upload always beats the provider's picture.
    avatar_url = models.URLField(_("avatar URL"), max_length=500, blank=True)

    # Personal identity fields
    date_of_birth = models.DateField(_("date of birth"), null=True, blank=True)
    gender = models.CharField(
        _("gender"),
        max_length=20,
        blank=True,
        choices=[("male", _("Male")), ("female", _("Female")), ("other", _("Other")), ("prefer_not_to_say", _("Prefer not to say"))],
    )
    id_card_number = models.CharField(_("ID card / passport number"), max_length=50, blank=True)
    city = models.CharField(_("city"), max_length=100, blank=True)
    role = models.CharField(
        _("role"),
        max_length=20,
        choices=Role.choices,
        default=Role.MERCHANT,
    )

    # Status flags
    is_active = models.BooleanField(_("active"), default=True)
    is_staff = models.BooleanField(_("staff status"), default=False)
    is_verified = models.BooleanField(_("email verified"), default=False)

    # Timestamps
    date_joined = models.DateTimeField(_("date joined"), default=timezone.now)
    last_login_ip = models.GenericIPAddressField(null=True, blank=True)

    # Referral Program
    referral_code = models.CharField(max_length=20, unique=True, blank=True, null=True)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["full_name"]

    def save(self, *args, **kwargs):
        if not self.referral_code:
            import string
            # Generate a 6-character random referral code
            self.referral_code = "".join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(6))
        super().save(*args, **kwargs)

    class Meta:
        verbose_name = _("user")
        verbose_name_plural = _("users")
        ordering = ["-date_joined"]
        indexes = [
            models.Index(fields=["email", "is_active"]),
            models.Index(fields=["role"]),
        ]

    def __str__(self):
        return f"{self.email} ({self.get_role_display()})"

    @property
    def display_name(self):
        return self.full_name or self.email.split("@")[0]

    @property
    def is_merchant(self):
        return self.role == self.Role.MERCHANT


class EmailVerificationOTP(models.Model):
    """
    6-digit OTP for email verification.
    Stored as SHA-256 hash for security.
    Expires after 10 minutes.
    """

    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="email_otps"
    )
    otp_hash = models.CharField(max_length=64)  # SHA-256 hex
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    is_used = models.BooleanField(default=False)

    class Meta:
        verbose_name = "Email Verification OTP"
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        if not self.expires_at:
            self.expires_at = timezone.now() + timezone.timedelta(minutes=10)
        super().save(*args, **kwargs)

    @classmethod
    def generate(cls, user):
        """Generate and store a new OTP for the user. Invalidates old ones."""
        cls.objects.filter(user=user, is_used=False).update(is_used=True)
        otp = f"{secrets.randbelow(1000000):06d}"
        otp_hash = hashlib.sha256(otp.encode()).hexdigest()
        instance = cls.objects.create(
            user=user,
            otp_hash=otp_hash,
            expires_at=timezone.now() + timezone.timedelta(minutes=10),
        )
        return otp, instance

    def verify(self, raw_otp: str) -> bool:
        """Verify a raw OTP string against the stored hash."""
        if self.is_used or timezone.now() > self.expires_at:
            return False
        incoming_hash = hashlib.sha256(raw_otp.encode()).hexdigest()
        if incoming_hash == self.otp_hash:
            self.is_used = True
            self.save(update_fields=["is_used"])
            return True
        return False


class PasswordResetToken(models.Model):
    """
    Secure token for password reset flow.
    Token is stored hashed; raw token is sent via email.
    """

    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="password_reset_tokens"
    )
    token_hash = models.CharField(max_length=64, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    is_used = models.BooleanField(default=False)

    class Meta:
        verbose_name = "Password Reset Token"
        ordering = ["-created_at"]

    @classmethod
    def generate(cls, user):
        """Generate a cryptographically secure reset token."""
        cls.objects.filter(user=user, is_used=False).update(is_used=True)
        raw_token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        instance = cls.objects.create(
            user=user,
            token_hash=token_hash,
            expires_at=timezone.now() + timezone.timedelta(hours=1),
        )
        return raw_token, instance

    @classmethod
    def verify_token(cls, raw_token: str):
        """Return the PasswordResetToken if valid, else None."""
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        try:
            obj = cls.objects.select_related("user").get(
                token_hash=token_hash,
                is_used=False,
                expires_at__gt=timezone.now(),
            )
        except cls.DoesNotExist:
            return None
        return obj

class PhoneVerificationOTP(models.Model):
    """
    6-digit OTP sent via Camoo SMS for phone number verification.

    Scoped to (user, phone) so a merchant can verify different numbers
    without old codes for a previous number interfering. Stored as a
    SHA-256 hash — the same pattern as EmailVerificationOTP. Expires in
    10 minutes and is single-use.
    """

    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="phone_otps"
    )
    # The number this OTP was sent to, normalised to E.164.
    phone = models.CharField(max_length=20)
    otp_hash = models.CharField(max_length=64)  # SHA-256 hex
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    is_used = models.BooleanField(default=False)

    class Meta:
        verbose_name = "Phone Verification OTP"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "phone", "is_used"]),
        ]

    @classmethod
    def generate(cls, user, phone: str):
        """Generate and store a new OTP for (user, phone). Invalidates old ones."""
        cls.objects.filter(user=user, phone=phone, is_used=False).update(is_used=True)
        otp = f"{secrets.randbelow(1000000):06d}"
        otp_hash = hashlib.sha256(otp.encode()).hexdigest()
        instance = cls.objects.create(
            user=user,
            phone=phone,
            otp_hash=otp_hash,
            expires_at=timezone.now() + timezone.timedelta(minutes=10),
        )
        return otp, instance

    def verify(self, raw_otp: str) -> bool:
        """Verify a raw OTP. Marks used on success."""
        if self.is_used or timezone.now() > self.expires_at:
            return False
        incoming_hash = hashlib.sha256(raw_otp.encode()).hexdigest()
        if incoming_hash == self.otp_hash:
            self.is_used = True
            self.save(update_fields=["is_used"])
            return True
        return False



class Referral(models.Model):
    """
    Tracks user referrals and their status.
    """
    class Status(models.TextChoices):
        PENDING = "pending", _("Pending")
        COMPLETED = "completed", _("Completed")
        
    referrer = models.ForeignKey(User, on_delete=models.CASCADE, related_name="referrals_made")
    referred_user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="referred_by")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    reward_amount = models.IntegerField(default=0, help_text="Amount earned from this referral")
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        unique_together = ("referrer", "referred_user")

    def __str__(self):
        return f"{self.referrer.email} referred {self.referred_user.email} ({self.status})"

