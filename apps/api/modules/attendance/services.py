"""AttendanceService — clock-in / clock-out + status maintenance."""

from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from modules.employee.models import Employee
from modules.schedule.services.holiday import HolidayService

from .models import AttendanceRecord
from .signals import attendance_clocked


class AttendanceService:
    @staticmethod
    @transaction.atomic
    def clock_in(
        *,
        employee: Employee,
        source: str = "web",
        ip: str | None = None,
        user_agent: str = "",
    ) -> AttendanceRecord:
        """Find-or-create today's record and stamp clock_in if not already set."""
        today = timezone.localdate()
        rec = AttendanceRecord.all_objects.filter(
            employee=employee,
            work_date=today,
            deleted_at__isnull=True,
        ).first()

        is_holiday_now = HolidayService.is_holiday(org_id=employee.org_id, on_date=today)
        holiday = (
            HolidayService.get_for_date(org_id=employee.org_id, on_date=today)
            if is_holiday_now
            else None
        )

        if rec is None:
            rec = AttendanceRecord.all_objects.create(
                org_id=employee.org_id,
                employee=employee,
                work_date=today,
                clock_in=timezone.now(),
                source=source,
                ip=ip,
                user_agent=user_agent[:512],
                is_holiday_work=is_holiday_now,
                holiday_id=holiday.id if holiday else None,
            )
        else:
            # idempotent: if clock_in already set, leave it alone
            if rec.clock_in is None:
                rec.clock_in = timezone.now()
                rec.source = source
                rec.ip = ip
                rec.user_agent = user_agent[:512]
                rec.is_holiday_work = is_holiday_now
                rec.holiday_id = holiday.id if holiday else None
                rec.save(
                    update_fields=[
                        "clock_in",
                        "source",
                        "ip",
                        "user_agent",
                        "is_holiday_work",
                        "holiday_id",
                        "updated_at",
                    ]
                )

        rec.recompute_status()
        rec.save(update_fields=["status", "updated_at"])

        attendance_clocked.send(sender=AttendanceRecord, record=rec, kind="in")
        return rec

    @staticmethod
    @transaction.atomic
    def clock_out(
        *,
        employee: Employee,
        source: str = "web",
        ip: str | None = None,
        user_agent: str = "",
    ) -> AttendanceRecord:
        today = timezone.localdate()
        rec = AttendanceRecord.all_objects.filter(
            employee=employee,
            work_date=today,
            deleted_at__isnull=True,
        ).first()
        if rec is None:
            rec = AttendanceRecord.all_objects.create(
                org_id=employee.org_id,
                employee=employee,
                work_date=today,
                clock_out=timezone.now(),
                source=source,
                ip=ip,
                user_agent=user_agent[:512],
            )
        else:
            rec.clock_out = timezone.now()
            rec.save(update_fields=["clock_out", "updated_at"])

        rec.recompute_status()
        rec.save(update_fields=["status", "updated_at"])

        attendance_clocked.send(sender=AttendanceRecord, record=rec, kind="out")
        return rec

    @staticmethod
    def today(*, employee: Employee) -> AttendanceRecord | None:
        today = timezone.localdate()
        return AttendanceRecord.all_objects.filter(
            employee=employee,
            work_date=today,
            deleted_at__isnull=True,
        ).first()
