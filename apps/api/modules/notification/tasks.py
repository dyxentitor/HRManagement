from celery import shared_task


@shared_task
def send_pending_email_digests():
    from .services.digest import send_digests

    return send_digests()


@shared_task
def check_email_health():
    from .services.health import check_email_health as _run

    return _run()


@shared_task(bind=True, max_retries=3)
def send_notification_email(self, notification_id):
    import logging

    from celery.exceptions import MaxRetriesExceededError
    from django.utils import timezone

    from .models import Notification
    from .services.send import render_and_send

    n = (
        Notification.objects.filter(id=notification_id, channel="email", delivery_status="pending")
        .select_related("user")
        .first()
    )
    if n is None:
        return "noop"
    try:
        status = render_and_send(n)
    except Exception as exc:
        try:
            raise self.retry(exc=exc, countdown=60)
        except MaxRetriesExceededError:
            n.delivery_status = "failed"
            n.save(update_fields=["delivery_status"])
            logging.getLogger(__name__).error(
                "send_notification_email failed permanently for %s", notification_id
            )
            return "failed"
    n.delivery_status = status
    n.sent_at = timezone.now()
    n.save(update_fields=["delivery_status", "sent_at"])
    return status
