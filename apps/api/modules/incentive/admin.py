from django.contrib import admin

from .models import Claim, Customer, EmployeeBond, MandayLedger, Project

admin.site.register([Customer, Project, Claim, MandayLedger, EmployeeBond])
