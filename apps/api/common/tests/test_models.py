"""Tests for common.models BaseModel + TenantBaseModel + soft-delete + scoping."""

import uuid
from datetime import datetime

import pytest
from django.db import models

from common.models import BaseModel, TenantBaseModel


# Concrete test models (created in test app via a migration in step 5).
class _SampleGlobal(BaseModel):
    name = models.CharField(max_length=64)

    class Meta:
        app_label = "common"


class _SampleTenant(TenantBaseModel):
    name = models.CharField(max_length=64)

    class Meta:
        app_label = "common"


@pytest.fixture
def org_a_id() -> uuid.UUID:
    return uuid.uuid4()


@pytest.fixture
def org_b_id() -> uuid.UUID:
    return uuid.uuid4()


@pytest.mark.django_db
def test_basemodel_assigns_uuid_id_and_timestamps() -> None:
    row = _SampleGlobal.objects.create(name="alpha")
    assert isinstance(row.id, uuid.UUID)
    assert isinstance(row.created_at, datetime)
    assert row.created_at.tzinfo is not None
    assert row.updated_at >= row.created_at
    assert row.deleted_at is None


@pytest.mark.django_db
def test_basemodel_soft_delete_excluded_by_default() -> None:
    row = _SampleGlobal.objects.create(name="will-soft-delete")
    row.delete()
    assert row.deleted_at is not None
    assert _SampleGlobal.objects.filter(pk=row.pk).count() == 0
    assert _SampleGlobal.all_objects.filter(pk=row.pk).count() == 1


@pytest.mark.django_db
def test_basemodel_hard_delete_removes_row() -> None:
    row = _SampleGlobal.objects.create(name="hard-delete-me")
    row.hard_delete()
    assert _SampleGlobal.all_objects.filter(pk=row.pk).count() == 0


@pytest.mark.django_db
def test_tenantbasemodel_requires_org_id() -> None:
    with pytest.raises(Exception):  # IntegrityError or ValidationError, depending on backend
        _SampleTenant.objects.create(name="no-org")


@pytest.mark.django_db
def test_tenantscoped_manager_filters_by_thread_local_org_id(
    org_a_id: uuid.UUID,
    org_b_id: uuid.UUID,
) -> None:
    from common.managers import clear_current_org_id, set_current_org_id

    _SampleTenant.objects.create(org_id=org_a_id, name="for-a")
    _SampleTenant.objects.create(org_id=org_b_id, name="for-b")

    set_current_org_id(org_a_id)
    try:
        names = list(_SampleTenant.objects.values_list("name", flat=True))
    finally:
        clear_current_org_id()
    assert names == ["for-a"]

    # all_objects bypass returns both regardless of context
    assert _SampleTenant.all_objects.count() == 2


@pytest.mark.django_db
def test_tenantscoped_manager_no_context_returns_empty() -> None:
    """When no org context is set, queries return no rows. Defense in depth."""
    from common.managers import clear_current_org_id

    _SampleTenant.objects.create(org_id=uuid.uuid4(), name="x")
    clear_current_org_id()
    assert _SampleTenant.objects.count() == 0
