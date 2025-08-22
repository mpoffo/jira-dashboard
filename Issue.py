from dataclasses import dataclass

@dataclass
class IssueDTO:
    def __init__(self, key, type, summary, assignee, status, epicLink, issueLink, epicName, size, sizeLead, lt, ltProgress, ltCodeRev,
                 ltTodoRev, ltReview, ltRTD, efficiency, created, updated, resolved, worklog, feature_key=None, feature_name=None, 
                 total_spent=None, labels=None, comments=[],rank=None, start_date=None):
        self.key = key
        self.type = type
        self.summary = summary
        self.assignee = assignee
        self.status = status
        self.epicLink = epicLink
        self.issueLink = issueLink
        self.epicName = epicName
        self.size = size
        self.sizeLead = sizeLead
        self.lt = lt
        self.ltProgress = ltProgress
        self.ltCodeRev = ltCodeRev
        self.ltTodoRev = ltTodoRev
        self.ltReview = ltReview
        self.ltRTD = ltRTD
        self.efficiency = efficiency
        self.created = created
        self.updated = updated
        self.resolved = resolved
        self.start_date = start_date
        self.worklog = worklog
        self.feature_key = feature_key
        self.feature_name = feature_name
        self.total_spent = total_spent
        self.labels = labels
        self.comments = comments
        self.rank = rank

@dataclass
class WorklogDTO:
    def __init__(self, author, timeSpent, timeSpentSeconds, started):
        self.author = author
        self.timeSpent = timeSpent
        self.timeSpentSeconds = timeSpentSeconds
        self.started = started