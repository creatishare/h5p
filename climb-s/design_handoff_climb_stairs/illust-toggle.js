// Collapsible illustration handle for the practice UI
(function () {
  const toggle = document.getElementById("illustToggle");
  const illust = document.getElementById("illustration");
  if (!toggle || !illust) return;

  let collapsed = false;
  toggle.addEventListener("click", () => {
    collapsed = !collapsed;
    illust.classList.toggle("is-collapsed", collapsed);
    toggle.setAttribute("aria-expanded", String(!collapsed));
    // Allow CSS transition to settle, then nudge hero placement.
    setTimeout(() => {
      window.dispatchEvent(new Event("resize"));
    }, 380);
  });

  // Copy buttons (sample inputs)
  document.querySelectorAll(".copy-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const wrap = btn.closest(".sample");
      const text = wrap && wrap.querySelector(".sample-box")?.textContent;
      if (text && navigator.clipboard) {
        navigator.clipboard.writeText(text.trim()).catch(() => {});
        const prev = btn.style.color;
        btn.style.color = "#18a06d";
        setTimeout(() => { btn.style.color = prev; }, 700);
      }
    });
  });
})();
