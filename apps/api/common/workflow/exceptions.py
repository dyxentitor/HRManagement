"""Domain exceptions for the workflow engine."""


class WorkflowError(Exception):
    """Base for all workflow engine errors."""


class InvalidTransition(WorkflowError):  # noqa: N818
    """Attempted state transition is not allowed for the request's current state."""


class NoApproverFound(WorkflowError):  # noqa: N818
    """No user could be resolved as the approver for a workflow step."""


class NotAuthorizedToAct(WorkflowError):  # noqa: N818
    """The acting user is not the resolved approver for this step."""
