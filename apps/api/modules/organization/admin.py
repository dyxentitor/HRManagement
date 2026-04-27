from django.contrib import admin

from .models import Country, CountryHoliday, CountryLeaveTypeDefault, Organization


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "country_code", "status", "created_at")
    search_fields = ("name", "slug")
    list_filter = ("status", "country_code")


@admin.register(Country)
class CountryAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "default_currency", "default_timezone")


@admin.register(CountryHoliday)
class CountryHolidayAdmin(admin.ModelAdmin):
    list_display = ("country_code", "date", "name", "type", "state_code")
    list_filter = ("country_code", "type")
    date_hierarchy = "date"


@admin.register(CountryLeaveTypeDefault)
class CountryLeaveTypeDefaultAdmin(admin.ModelAdmin):
    list_display = ("country_code", "code", "name", "default_days", "statutory")
    list_filter = ("country_code", "statutory")
