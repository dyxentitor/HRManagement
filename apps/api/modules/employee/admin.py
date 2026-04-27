from django.contrib import admin

from .models import Employee


@admin.register(Employee)
class EmployeeAdmin(admin.ModelAdmin):
    list_display = (
        "employee_code",
        "first_name",
        "last_name",
        "email",
        "department",
        "role_title",
        "status",
        "hire_date",
    )
    list_filter = ("status", "employment_type", "schedule_type", "department")
    search_fields = ("employee_code", "first_name", "last_name", "email")
    readonly_fields = (
        "id",
        "ic_last4",
        "bank_account_last4",
        "created_at",
        "updated_at",
        "deleted_at",
    )
    fieldsets = (
        (
            "Identity",
            {
                "fields": (
                    "id",
                    "user",
                    "employee_code",
                    "first_name",
                    "last_name",
                    "preferred_name",
                    "email",
                    "phone",
                    "alt_phone",
                )
            },
        ),
        (
            "Personal",
            {
                "fields": (
                    "ic_number",
                    "ic_last4",
                    "date_of_birth",
                    "gender",
                    "nationality",
                    "marital_status",
                    "religion",
                )
            },
        ),
        (
            "Address",
            {
                "fields": (
                    "address_line1",
                    "address_line2",
                    "city",
                    "state",
                    "postcode",
                    "country_code",
                )
            },
        ),
        (
            "Employment",
            {
                "fields": (
                    "department",
                    "manager",
                    "role_title",
                    "employment_type",
                    "schedule_type",
                    "hire_date",
                    "probation_end_date",
                    "contract_end_date",
                    "confirmed_at",
                    "status",
                )
            },
        ),
        (
            "Bank",
            {"fields": ("bank_name", "bank_account_number", "bank_account_last4")},
        ),
        (
            "Tax IDs (MY)",
            {"fields": ("lhdn_tax_no", "epf_no", "socso_no", "eis_no")},
        ),
        (
            "Emergency Contact",
            {
                "fields": (
                    "emergency_contact_name",
                    "emergency_contact_relationship",
                    "emergency_contact_phone",
                )
            },
        ),
        (
            "Ops",
            {
                "fields": (
                    "timezone",
                    "locale",
                    "created_at",
                    "updated_at",
                    "deleted_at",
                )
            },
        ),
    )
