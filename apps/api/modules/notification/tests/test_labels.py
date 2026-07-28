from modules.notification.labels import domain_label, domain_of, label_for


def test_label_for_known_and_fallback():
    assert label_for("leave.approved") == "Leave request approved"
    assert label_for("assignment.overdue") == "Assignment overdue"
    # fallback: title-case last segment
    assert label_for("widget.frobnicated_thing") == "Frobnicated Thing"


def test_domain_helpers():
    assert domain_of("leave.approved") == "leave"
    assert domain_label("leave.approved") == "Leave"
    assert domain_label("assignment.overdue") == "Action center"
    assert domain_label("zzz.thing") == "Zzz"


def test_all_default_pref_types_have_labels():
    from modules.notification.labels import EVENT_LABELS
    from modules.notification.services.preferences import DEFAULT_PREFERENCES

    for t, *_ in DEFAULT_PREFERENCES:
        assert t in EVENT_LABELS, f"missing label for {t}"
