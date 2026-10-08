<?php /** @var bool $forced */ ?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="csrf-token" content="<?= e(csrf_token()) ?>" />
  <title>Change Password · CUJ Date Sheet</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet" />
  <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" rel="stylesheet" />
  <link href="/assets/css/app.css" rel="stylesheet" />
</head>
<body class="d-flex align-items-center justify-content-center min-vh-100 p-3">
  <div class="card-surface p-4 p-sm-5" style="max-width: 420px; width: 100%;">
    <h1 class="h4 fw-bold mb-1">Set a new password</h1>
    <p class="text-muted small mb-4">
      <?= $forced ? 'For security, you must change your password before continuing.' : 'Update your password below.' ?>
    </p>

    <form id="cpForm" novalidate>
      <div class="mb-3">
        <label class="form-label" for="current_password">Current password</label>
        <input type="password" class="form-control" id="current_password" name="current_password" autocomplete="current-password" required />
        <div class="invalid-text" data-error-for="current_password"></div>
      </div>
      <div class="mb-3">
        <label class="form-label" for="new_password">New password</label>
        <input type="password" class="form-control" id="new_password" name="new_password" autocomplete="new-password" required />
        <div class="form-text">At least 10 characters with a letter and a digit.</div>
        <div class="invalid-text" data-error-for="new_password"></div>
      </div>
      <div class="mb-3">
        <label class="form-label" for="confirm_password">Confirm new password</label>
        <input type="password" class="form-control" id="confirm_password" name="confirm_password" autocomplete="new-password" required />
        <div class="invalid-text" data-error-for="confirm_password"></div>
      </div>
      <button type="submit" class="btn btn-primary w-100" id="cpSubmit">Save password</button>
    </form>
  </div>

  <script type="module">
    import { apiSend, ApiError } from '/assets/js/api.js';
    import { clearFieldErrors, fieldErrorsFrom, setLoading, toast } from '/assets/js/ui.js';

    const form = document.getElementById('cpForm');
    const submitBtn = document.getElementById('cpSubmit');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearFieldErrors(form);

      const newPassword = document.getElementById('new_password').value;
      const confirmPassword = document.getElementById('confirm_password').value;
      if (newPassword !== confirmPassword) {
        document.querySelector('[data-error-for="confirm_password"]').textContent = 'Passwords do not match';
        return;
      }

      setLoading(submitBtn, true, 'Save password');
      try {
        await apiSend('POST', '/auth/change-password', {
          current_password: document.getElementById('current_password').value,
          new_password: newPassword,
        });
        toast('Password changed. You can continue now.');
        window.location.href = '/dashboard';
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.fields) fieldErrorsFrom(err, form);
          else toast(err.message, 'error');
        }
      } finally {
        setLoading(submitBtn, false, 'Save password');
      }
    });
  </script>
</body>
</html>
