"""Seed default preferences on User create."""

from __future__ import annotations

from django.db.models.signals import post_save
from django.dispatch import receiver

from modules.identity.models import User

from .services.preferences import seed_for_user


@receiver(post_save, sender=User)
def _seed_preferences_on_user_create(sender, instance: User, created: bool, **kwargs):
    if not created:
        return
    seed_for_user(instance)
