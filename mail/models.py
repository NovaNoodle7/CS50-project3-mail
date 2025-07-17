from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """Custom user model in case future extensions are required."""
    email = models.EmailField(unique=True)  # Ensure email uniqueness

    def __str__(self):
        return self.email


class Email(models.Model):
    """Email model representing messages between users."""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="emails")
    sender = models.ForeignKey(User, on_delete=models.PROTECT, related_name="emails_sent")
    recipients = models.ManyToManyField(User, related_name="emails_received")
    subject = models.CharField(max_length=255, blank=False, default="(No Subject)")
    body = models.TextField(blank=True)
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)  # Indexed for fast querying
    read = models.BooleanField(default=False, db_index=True)
    archived = models.BooleanField(default=False, db_index=True)

    def serialize(self):
        """Serialize email data for API responses."""
        return {
            "id": self.id,
            "sender": self.sender.email,
            "recipients": [user.email for user in self.recipients.all()],
            "subject": self.subject,
            "body": self.body,
            "timestamp": self.timestamp.strftime("%b %d %Y, %I:%M %p"),
            "read": self.read,
            "archived": self.archived
        }

    def __str__(self):
        """String representation for debugging & admin panel."""
        return f"Email from {self.sender.email} to {', '.join(user.email for user in self.recipients.all())}"
