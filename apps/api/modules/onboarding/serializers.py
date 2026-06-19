"""Serializers for the onboarding module."""

from __future__ import annotations

from rest_framework import serializers

from .models import OnboardingChecklist, OnboardingItem


class OnboardingItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = OnboardingItem
        fields = ("id", "label", "done", "order")
        read_only_fields = ("id",)


class OnboardingChecklistSerializer(serializers.ModelSerializer):
    items = OnboardingItemSerializer(many=True, read_only=True)

    class Meta:
        model = OnboardingChecklist
        fields = (
            "id",
            "employee_id",
            "status",
            "started_at",
            "completed_at",
            "items",
            "created_at",
        )
        read_only_fields = ("id", "status", "started_at", "completed_at", "items", "created_at")
