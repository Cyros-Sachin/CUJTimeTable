<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="csrf-token" content="<?= e(csrf_token()) ?>" />
  <title>Login · CUJ Date Sheet</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+Devanagari:wght@400;600&display=swap" rel="stylesheet" />
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet" />
  <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" rel="stylesheet" />
  <link href="/assets/css/app.css" rel="stylesheet" />
</head>
<body class="d-flex align-items-center justify-content-center min-vh-100 p-3">
  <div class="card-surface p-4 p-sm-5" style="max-width: 420px; width: 100%;">
    <div class="text-center mb-4">
      <p class="font-devanagari fw-bold fs-4 mb-0" style="color: var(--cuj-primary);">जम्मू केंद्रीय विश्वविद्यालय</p>
      <h1 class="h4 fw-bold mb-1">Central University of Jammu</h1>
      <p class="text-muted small mb-0">Exam Date Sheet Automation</p>
    </div>

    <form id="loginForm" novalidate>
      <div class="mb-3">
        <label class="form-label" for="email">Email</label>
        <input type="email" class="form-control" id="email" name="email" autocomplete="username" required />
        <div class="invalid-text" data-error-for="email"></div>
      </div>
      <div class="mb-3">
        <label class="form-label" for="password">Password</label>
        <div class="input-group">
          <input type="password" class="form-control" id="password" name="password" autocomplete="current-password" required />
          <button class="btn btn-outline-secondary" type="button" id="togglePassword"><i class="bi bi-eye"></i></button>
        </div>
        <div class="invalid-text" data-error-for="password"></div>
      </div>
      <div class="alert alert-danger d-none" id="loginError"></div>
      <button type="submit" class="btn btn-primary w-100" id="loginSubmit">Log in</button>
    </form>
  </div>

  <script type="module">
    import { apiSend, ApiError } from '/assets/js/api.js';
    import { clearFieldErrors, fieldErrorsFrom, setLoading } from '/assets/js/ui.js';

    const form = document.getElementById('loginForm');
    const submitBtn = document.getElementById('loginSubmit');
    const errorBox = document.getElementById('loginError');

    document.getElementById('togglePassword').addEventListener('click', () => {
      const input = document.getElementById('password');
      input.type = input.type === 'password' ? 'text' : 'password';
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearFieldErrors(form);
      errorBox.classList.add('d-none');
      setLoading(submitBtn, true, 'Log in');

      try {
        const res = await apiSend('POST', '/auth/login', {
          email: document.getElementById('email').value,
          password: document.getElementById('password').value,
        });
        window.location.href = res.data.must_change_password ? '/change-password' : '/dashboard';
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.fields) fieldErrorsFrom(err, form);
          errorBox.textContent = err.message;
          errorBox.classList.remove('d-none');
        }
      } finally {
        setLoading(submitBtn, false, 'Log in');
      }
    });
  </script>
</body>
</html>
