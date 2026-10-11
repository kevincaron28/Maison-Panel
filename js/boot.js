/* Deliberately classic ES5: stays readable even when a WebView cannot parse the app modules. */
(function () {
  var status = document.getElementById("boot-status");
  var message = document.getElementById("boot-message");
  var timer = setTimeout(function () {
    status.hidden = false;
    message.textContent =
      "Le panneau ne démarre pas. Vérifiez la connexion, puis mettez à jour Android System WebView et Fully Kiosk.";
  }, 12000);
  window.addEventListener("maison-ready", function () {
    clearTimeout(timer);
    status.hidden = true;
  });
  document.getElementById("retry-start").onclick = function () {
    location.reload();
  };
})();
