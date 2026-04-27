"""OrgService — direct manager / direct reports / reporting chain.

Note: OrgService accepts an Employee-like object (an entity with `.id` and
`.manager_id`). M1's Employee model lands in M2; for now we test against a
minimal namedtuple to verify the algorithm. M2's tests will exercise the
real model.
"""

import uuid
from collections import namedtuple

import pytest

from modules.identity.services.org import OrgService

_E = namedtuple("_E", ("id", "manager_id"))


def _chain(svc: OrgService, employee_id: uuid.UUID) -> list[uuid.UUID]:
    return [e.id for e in svc.get_reporting_chain(employee_id)]


@pytest.fixture
def graph() -> dict[uuid.UUID, _E]:
    """Builds a 4-level chain: ceo -> vp -> mgr -> emp."""
    ceo = _E(uuid.uuid4(), None)
    vp = _E(uuid.uuid4(), ceo.id)
    mgr = _E(uuid.uuid4(), vp.id)
    emp = _E(uuid.uuid4(), mgr.id)
    return {e.id: e for e in (ceo, vp, mgr, emp)}


def test_get_direct_manager_returns_parent(graph) -> None:
    nodes = list(graph.values())
    emp = nodes[3]
    svc = OrgService(employee_lookup=lambda eid: graph.get(eid))
    mgr = svc.get_direct_manager(emp.id)
    assert mgr is not None and mgr.id == emp.manager_id


def test_get_direct_manager_for_top_returns_none(graph) -> None:
    ceo = next(iter(graph.values()))
    svc = OrgService(employee_lookup=lambda eid: graph.get(eid))
    assert svc.get_direct_manager(ceo.id) is None


def test_reporting_chain_walks_up_to_ceo(graph) -> None:
    nodes = list(graph.values())
    emp = nodes[3]
    svc = OrgService(employee_lookup=lambda eid: graph.get(eid))
    chain = _chain(svc, emp.id)
    assert chain == [nodes[2].id, nodes[1].id, nodes[0].id]


def test_reporting_chain_respects_max_depth(graph) -> None:
    nodes = list(graph.values())
    emp = nodes[3]
    svc = OrgService(employee_lookup=lambda eid: graph.get(eid))
    chain = _chain(svc.with_max_depth(1), emp.id)  # exposed convenience
    assert len(chain) <= 1


def test_is_manager_of_direct_only(graph) -> None:
    nodes = list(graph.values())
    mgr, emp = nodes[2], nodes[3]
    svc = OrgService(employee_lookup=lambda eid: graph.get(eid))
    assert svc.is_manager_of(mgr.id, emp.id) is True
    assert svc.is_manager_of(nodes[1].id, emp.id) is False  # vp is grandparent


def test_is_manager_of_transitive(graph) -> None:
    nodes = list(graph.values())
    vp, emp = nodes[1], nodes[3]
    svc = OrgService(employee_lookup=lambda eid: graph.get(eid))
    assert svc.is_manager_of(vp.id, emp.id, transitive=True) is True


def test_get_approvers_default_returns_direct_manager(graph) -> None:
    nodes = list(graph.values())
    emp = nodes[3]
    svc = OrgService(employee_lookup=lambda eid: graph.get(eid))
    approvers = svc.get_approvers(emp.id, action="leave.request.approve")
    assert len(approvers) == 1
    assert approvers[0].id == emp.manager_id
