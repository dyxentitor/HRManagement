from django.contrib import admin

from .models import (
    ClaimApproval,
    ClaimAttachment,
    ClaimCategory,
    ClaimPolicy,
    ClaimRequest,
)


@admin.register(ClaimCategory)
class ClaimCategoryAdmin(admin.ModelAdmin):
    list_display = (
        "code",
        "name",
        "org_id",
        "requires_attachment",
        "currency_code",
    )


@admin.register(ClaimPolicy)
class ClaimPolicyAdmin(admin.ModelAdmin):
    list_display = (
        "category",
        "annual_limit",
        "monthly_limit",
        "approval_chain_code",
    )


@admin.register(ClaimRequest)
class ClaimRequestAdmin(admin.ModelAdmin):
    list_display = ("employee", "category", "amount", "status", "submitted_at")
    list_filter = ("status", "category")
    date_hierarchy = "submitted_at"


@admin.register(ClaimAttachment)
class ClaimAttachmentAdmin(admin.ModelAdmin):
    list_display = (
        "filename",
        "claim",
        "content_type",
        "size_bytes",
        "uploaded_at",
    )


@admin.register(ClaimApproval)
class ClaimApprovalAdmin(admin.ModelAdmin):
    list_display = ("claim", "level", "approver_id", "status", "acted_at")
    list_filter = ("status",)
