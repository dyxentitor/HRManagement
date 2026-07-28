from django.db import migrations


def delete_auth_login_prefs(apps, schema_editor):
    NotificationPreference = apps.get_model("notification", "NotificationPreference")
    NotificationPreference.objects.filter(type="auth.login").delete()


class Migration(migrations.Migration):
    dependencies = [("notification", "0002_notification_send_attempts")]
    operations = [migrations.RunPython(delete_auth_login_prefs, migrations.RunPython.noop)]
