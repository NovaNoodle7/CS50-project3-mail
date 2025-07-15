import json
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required
from django.db import IntegrityError
from django.http import JsonResponse, HttpResponse, HttpResponseRedirect
from django.shortcuts import render, redirect
from django.urls import reverse
from django.views.decorators.csrf import csrf_exempt

from .models import User, Email

def index(request):
    """
    Show inbox for authenticated users, otherwise redirect to login.
    """
    if request.user.is_authenticated:
        return render(request, "mail/inbox.html")
    else:
        return HttpResponseRedirect(reverse("login"))

@csrf_exempt
@login_required
def compose(request):
    """
    Handle sending a new email via POST.
    """
    if request.method != "POST":
        return JsonResponse({"error": "POST request required."}, status=400)

    data = json.loads(request.body)
    recipients_raw = data.get("recipients", "")
    emails = [email.strip() for email in recipients_raw.split(",") if email.strip()]
    if not emails:
        return JsonResponse({"error": "At least one recipient required."}, status=400)

    # Prevent sending to self
    if request.user.email in emails:
        return JsonResponse({"error": "You cannot send an email to yourself."}, status=400)

    # Convert email addresses to User objects
    recipients = []
    for email in emails:
        try:
            user = User.objects.get(email=email)
            recipients.append(user)
        except User.DoesNotExist:
            return JsonResponse({"error": f"User with email {email} does not exist."}, status=400)

    subject = data.get("subject", "")
    body = data.get("body", "")

    # Create email for each user (sender and recipients)
    users = set([request.user] + recipients)
    for user in users:
        email_obj = Email(
            user=user,
            sender=request.user,
            subject=subject,
            body=body,
            read=(user == request.user)
        )
        email_obj.save()
        for recipient in recipients:
            email_obj.recipients.add(recipient)
        email_obj.save()

    return JsonResponse({"message": "Email sent successfully."}, status=201)

@login_required
def mailbox(request, mailbox):
    """
    Return emails for the requested mailbox.
    """
    if mailbox == "inbox":
        emails = Email.objects.filter(
            user=request.user, recipients=request.user, archived=False
        )
    elif mailbox == "sent":
        emails = Email.objects.filter(
            user=request.user, sender=request.user
        )
    elif mailbox == "archive":
        emails = Email.objects.filter(
            user=request.user, archived=True
        )
    else:
        return JsonResponse({"error": "Invalid mailbox."}, status=400)

    emails = emails.order_by("-timestamp").all()
    return JsonResponse([email.serialize() for email in emails], safe=False)

@csrf_exempt
@login_required
def email(request, email_id):
    """
    Handle GET (view), PUT (update read/archive) for a single email.
    """
    try:
        email = Email.objects.get(user=request.user, pk=email_id)
    except Email.DoesNotExist:
        return JsonResponse({"error": "Email not found."}, status=404)

    if request.method == "GET":
        return JsonResponse(email.serialize())

    elif request.method == "PUT":
        data = json.loads(request.body)
        if data.get("read") is not None:
            email.read = data["read"]
        if data.get("archived") is not None:
            email.archived = data["archived"]
        email.save()
        return HttpResponse(status=204)

    else:
        return JsonResponse({"error": "GET or PUT request required."}, status=400)

def login_view(request):
    """
    Handle user login.
    """
    if request.method == "POST":
        email = request.POST["email"]
        password = request.POST["password"]
        user = authenticate(request, username=email, password=password)
        if user is not None:
            login(request, user)
            return redirect('index')  # یا هر صفحه‌ای که می‌خواهی
        else:
            return render(request, "mail/login.html", {
                "message": "Invalid email and/or password."
            })
    else:
        return render(request, "mail/login.html")

def logout_view(request):
    """
    Log out the user.
    """
    logout(request)
    return HttpResponseRedirect(reverse("index"))

def register(request):
    """
    Handle user registration.
    """
    if request.method == "POST":
        email = request.POST["email"]
        password = request.POST["password"]
        confirmation = request.POST["confirmation"]
        if password != confirmation:
            return render(request, "mail/register.html", {
                "message": "Passwords must match."
            })
        try:
            user = User.objects.create_user(email, email, password)
            user.save()
        except IntegrityError:
            return render(request, "mail/register.html", {
                "message": "Email address already taken."
            })
        login(request, user)
        return HttpResponseRedirect(reverse("index"))
    else:
        return render(request, "mail/register.html")

@csrf_exempt
@login_required
def delete_email(request, email_id):
    """
    Delete an email for the user.
    """
    if request.method != "DELETE":
        return JsonResponse({"error": "DELETE request required."}, status=400)
    try:
        email = Email.objects.get(user=request.user, pk=email_id)
        email.delete()
        # فقط status 204 بدون بدنه
        return HttpResponse(status=204)
    except Email.DoesNotExist:
        return JsonResponse({"error": "Email not found."}, status=404)
