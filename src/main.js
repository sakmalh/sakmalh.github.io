import './style.css';

// Copy-to-clipboard buttons (contact section).
for (const btn of document.querySelectorAll('.copy-btn')) {
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(btn.dataset.copy);
      btn.textContent = 'copied!';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.textContent = 'copy';
        btn.classList.remove('copied');
      }, 1600);
    } catch {
      // Clipboard unavailable (permissions, http): fall back to selecting nothing;
      // the address is plain text right next to the button.
    }
  });
}
