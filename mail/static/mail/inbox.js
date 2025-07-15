document.addEventListener('DOMContentLoaded', function() {
  document.querySelector('#inbox').addEventListener('click', () => load_mailbox('inbox'));
  document.querySelector('#sent').addEventListener('click', () => load_mailbox('sent'));
  document.querySelector('#archived').addEventListener('click', () => load_mailbox('archive'));
  document.querySelector('#compose').addEventListener('click', compose_email);
  document.querySelector('#compose-form').addEventListener('submit', send_email);
  load_mailbox('inbox');
});

function compose_email() {
  document.querySelector('#emails-view').style.display = 'none';
  document.querySelector('#compose-view').style.display = 'block';
  document.querySelector('#email-detail-view').style.display = 'none';
  document.querySelector('#compose-recipients').value = '';
  document.querySelector('#compose-subject').value = '';
  document.querySelector('#compose-body').value = '';
  // حذف div پیام اصلی اگر وجود دارد
  const oldDiv = document.getElementById('original-message');
  if (oldDiv) oldDiv.remove();
}

function view_email(id, mailbox = null) {
  fetch(`/emails/${id}`)
    .then(response => response.json())
    .then(email => {
      document.querySelector('#emails-view').style.display = 'none';
      document.querySelector('#compose-view').style.display = 'none';
      document.querySelector('#email-detail-view').style.display = 'block';

      document.querySelector('#email-detail-view').innerHTML = `
        <ul class="list-group mb-3">
          <li class="list-group-item"><strong>From:</strong> ${email.sender}</li>
          <li class="list-group-item"><strong>To:</strong> ${email.recipients}</li>
          <li class="list-group-item"><strong>Subject:</strong> ${email.subject}</li>
          <li class="list-group-item"><strong>Timestamp:</strong> ${email.timestamp}</li>
          <li class="list-group-item">${email.body}</li>
        </ul>
      `;

      // Mark as read
      if (!email.read) {
        fetch(`/emails/${email.id}/`, {
          method: 'PUT',
          body: JSON.stringify({ read: true }),
          headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCSRFToken()
          }
        });
      }

      // فقط اگر mailbox 'inbox' یا 'archive' بود دکمه آرشیو/آن‌آرشیو را نمایش بده
      if (mailbox === 'inbox' || mailbox === 'archive') {
        const btn_arch = document.createElement('button');
        btn_arch.innerHTML = email.archived ? "Unarchive" : "Archive";
        btn_arch.className = email.archived ? "btn btn-success me-2" : "btn btn-danger me-2";
        btn_arch.addEventListener('click', function() {
          fetch(`/emails/${email.id}/`, {
            method: 'PUT',
            body: JSON.stringify({ archived: !email.archived }),
            headers: {
              'Content-Type': 'application/json',
              'X-CSRFToken': getCSRFToken()
            }
          })
          .then(() => {
            Swal.fire({
              icon: 'success',
              title: email.archived ? 'Unarchived!' : 'Archived!',
              timer: 1200,
              showConfirmButton: false
            });
            // بعد از آرشیو یا آن‌آرشیو، میل‌باکس مناسب را لود کن
            load_mailbox(email.archived ? 'inbox' : 'archive');
          });
        });
        document.querySelector('#email-detail-view').append(btn_arch);
      }

      // Reply button
      const btn_reply = document.createElement('button');
      btn_reply.innerHTML = "Reply";
      btn_reply.className = "btn btn-info me-2";
      btn_reply.addEventListener('click', function() {
        compose_email();
        document.querySelector('#compose-recipients').value = email.sender;
        let subject = email.subject.startsWith("Re:") ? email.subject : "Re: " + email.subject;
        document.querySelector('#compose-subject').value = subject;

        // حذف هر div قبلی
        const oldDiv = document.getElementById('original-message');
        if (oldDiv) oldDiv.remove();

        // ساخت div فقط‌خواندنی برای متن اصلی ایمیل
        const originalDiv = document.createElement('div');
        originalDiv.id = 'original-message';
        originalDiv.className = "alert alert-secondary mb-2";
        originalDiv.style.fontSize = "0.95rem";
        originalDiv.innerText = `On ${email.timestamp}, ${email.sender} wrote:\n${email.body}`;

        // قرار دادن div فقط‌خواندنی بالای باکس ریپلای
        const composeBody = document.querySelector('#compose-body');
        composeBody.value = '';
        composeBody.parentNode.insertBefore(originalDiv, composeBody);
      });
      document.querySelector('#email-detail-view').append(btn_reply);

      // Delete button
      const btn_delete = document.createElement('button');
      btn_delete.innerHTML = "🗑️ Delete";
      btn_delete.className = "btn btn-outline-danger";
      btn_delete.addEventListener('click', function() {

        btn_delete.disabled = true;
        btn_delete.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Deleting...';
        fetch(`/emails/delete/${email.id}/`, {
          method: 'DELETE',
          headers: {
            'X-CSRFToken': getCSRFToken()
          }
        })
          .then(response => {
            if (response.status === 204) {
              Swal.fire({
                icon: 'success',
                title: 'Deleted!',
                text: 'Email deleted successfully.',
                showConfirmButton: true
              }).then(() => {
                load_mailbox('inbox');
              });
            } else {
              // فقط اگر response بدنه دارد json را اجرا کن
              response.text().then(text => {
                let result = {};
                try {
                  result = JSON.parse(text);
                } catch (e) {
                  result = { error: "Could not delete email." };
                }
                Swal.fire({
                  icon: 'error',
                  title: 'Error',
                  text: result.error || 'Could not delete email.'
                });
                btn_delete.disabled = false;
                btn_delete.innerHTML = "🗑️ Delete";
              });
            }
          });
      });
      document.querySelector('#email-detail-view').append(btn_delete);
    });
}

function load_mailbox(mailbox) {
  document.querySelector('#emails-view').style.display = 'block';
  document.querySelector('#compose-view').style.display = 'none';
  document.querySelector('#email-detail-view').style.display = 'none';
  document.querySelector('#emails-view').innerHTML = `<h3>${mailbox.charAt(0).toUpperCase() + mailbox.slice(1)}</h3>`;

  fetch(`/emails/${mailbox}`)
    .then(response => {
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.indexOf("application/json") !== -1) {
        return response.json();
      } else {
        // اگر JSON نبود، یعنی احتمالاً صفحه لاگین یا خطا برگشته
        return Promise.reject("Not JSON");
      }
    })
    .then(emails => {
      emails.forEach(singleEmail => {
        const newEmail = document.createElement('div');
        newEmail.className = singleEmail.read ? 'list-group-item read' : 'list-group-item unread';
        newEmail.innerHTML = `
          <h6>Sender: ${singleEmail.sender}</h6>
          <h5>Subject: ${singleEmail.subject}</h5>
          <p>${singleEmail.timestamp}</p>
        `;
        newEmail.addEventListener('click', function() {
          view_email(singleEmail.id, mailbox); // mailbox را پاس بده
        });
        document.querySelector('#emails-view').append(newEmail);
      });
    })
    .catch(error => {
      Swal.fire({
        icon: 'error',
        title: 'Session expired',
        text: 'Please log in again.'
      });
      // یا ریدایرکت به صفحه لاگین
      window.location.href = '/login/';
    });
}

function send_email(event) {
  event.preventDefault();
  const recipient = document.querySelector('#compose-recipients').value;
  const subject = document.querySelector('#compose-subject').value;
  const body = document.querySelector('#compose-body').value;

  fetch('/emails/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRFToken': getCSRFToken()
    },
    body: JSON.stringify({
      recipients: recipient,
      subject: subject,
      body: body
    })
  })
  .then(response => response.json())
  .then(result => {
    if (result.error) {
      Swal.fire({
        icon: 'error',
        title: 'Oops...',
        text: result.error
      });
    } else {
      Swal.fire({
        icon: 'success',
        title: 'Success!',
        text: 'Email sent successfully!',
        timer: 1200,
        showConfirmButton: false
      });
      load_mailbox('sent');
    }
  });
}

function getCSRFToken() {
  let cookieValue = null;
  if (document.cookie && document.cookie !== '') {
    const cookies = document.cookie.split(';');
    for (let cookie of cookies) {
      cookie = cookie.trim();
      if (cookie.substring(0, 10) === 'csrftoken=') {
        cookieValue = decodeURIComponent(cookie.substring(10));
        break;
      }
    }
  }
  return cookieValue;
}




  }
  return cookieValue;
}


