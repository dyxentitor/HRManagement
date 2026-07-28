from celery import shared_task


@shared_task
def send_pending_email_digests():
    from .services.digest import send_digests

    return send_digests()


@shared_task
def check_email_health():
    from .services.health import check_email_health as _run

    return _run()
