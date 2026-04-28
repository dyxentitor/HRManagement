from django.contrib import admin

from .models import EmailDigestRun, Notification, NotificationPreference


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("type", "channel", "user", "delivery_status", "read_at", "created_at")
    list_filter = ("channel", "delivery_status", "priority")
    search_fields = ("type", "user__email")


@admin.register(NotificationPreference)
class NotificationPreferenceAdmin(admin.ModelAdmin):
    list_display = ("user", "type", "channel", "enabled")
    list_filter = ("channel", "enabled")


@admin.register(EmailDigestRun)
class EmailDigestRunAdmin(admin.ModelAdmin):
    list_display = ("user", "notification_count", "sent_at")
    date_hierarchy = "sent_at"
