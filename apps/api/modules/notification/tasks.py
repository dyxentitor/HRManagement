from celery import shared_task


@shared_task
def send_pending_email_digests():
    from .services.digest import send_digests

    return send_digests()
